import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  Image,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../lib/auth';
import { getReceipts, getReceiptImageUrl, Receipt, getBudgets, Budget } from '../lib/api';
import { textDirectionStyle } from '../lib/rtl';
import { COLORS, CATEGORY_META, budgetBarColor } from '../lib/theme';
import {
  CategoryTotal,
  budgetUsagePct,
  budgetsByCategory as indexBudgetsByCategory,
  percentOf,
  receiptsForMonth,
  receiptsSince,
  sortedCategoryTotals,
  sumLimits,
  sumTotals,
} from '../lib/spending';
import { greetingFor } from '../lib/greeting';
import { formatCurrency } from '../lib/currency';

function categoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.Other;
}

// Spec (Screen 3): 34px circle, #f2f2f7 bg, black initials — visible because
// the header it sits on is white (COLORS.surface).
const Avatar: React.FC<{ initials: string }> = ({ initials }) => (
  <View style={styles.avatar} testID="dashboard-avatar">
    <Text style={styles.avatarText}>{initials}</Text>
  </View>
);

const CategoryItem: React.FC<{ item: CategoryTotal; totalSpent: number; budget?: Budget }> = ({
  item,
  totalSpent,
  budget,
}) => {
  const meta = categoryMeta(item.category);
  // Use budget percentage if budget exists, otherwise use share of total spend
  const displayPercentage = budget
    ? budgetUsagePct(item.spent, budget.monthly_limit)
    : percentOf(item.spent, totalSpent);
  const barColor = budget ? budgetBarColor(displayPercentage) : COLORS.success;

  return (
    <View style={styles.categoryCard} testID={`category-card-${item.category}`}>
      <View style={[styles.categoryIconContainer, { backgroundColor: meta.backgroundColor }]}>
        <MaterialCommunityIcons name={meta.icon as any} size={24} color={meta.color} />
      </View>
      <Text style={styles.categoryName}>{item.category}</Text>
      <Text style={styles.categoryAmount}>{formatCurrency(item.spent)}</Text>
      <View style={styles.progressBarContainer}>
        <View
          testID={`category-bar-${item.category}`}
          style={[
            styles.progressBar,
            { width: `${Math.min(displayPercentage, 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
    </View>
  );
};

const ReceiptItem: React.FC<{ receipt: Receipt; onPress: () => void }> = ({ receipt, onPress }) => {
  const primaryCategory = receipt.raw_response.items[0]?.category ?? 'Other';
  const meta = categoryMeta(primaryCategory);

  return (
    <TouchableOpacity style={styles.receiptItem} onPress={onPress} testID={`receipt-item-${receipt.id}`}>
      <View style={[styles.receiptIconContainer, { backgroundColor: meta.backgroundColor }]}>
        <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
      </View>
      <View style={styles.receiptInfo}>
        <Text style={[styles.receiptMerchant, textDirectionStyle(receipt.raw_response.merchant)]}>
          {receipt.raw_response.merchant}
        </Text>
        <Text style={styles.receiptDate}>{receipt.raw_response.date}</Text>
      </View>
      <Text style={styles.receiptAmount}>
        {formatCurrency(receipt.raw_response.total, { decimals: 2 })}
      </Text>
    </TouchableOpacity>
  );
};

const ReceiptImageModal: React.FC<{ receipt: Receipt; accessToken: string; onClose: () => void }> = ({
  receipt,
  accessToken,
  onClose,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setImageUrl(null);

    getReceiptImageUrl(receipt.id, accessToken)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'No image available for this receipt');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [receipt.id, accessToken]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, textDirectionStyle(receipt.raw_response.merchant)]}>
                {receipt.raw_response.merchant}
              </Text>
              <Text style={styles.modalSubtitle}>
                {receipt.raw_response.date} · {formatCurrency(receipt.raw_response.total, { decimals: 2 })}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} testID="receipt-modal-close">
              <MaterialCommunityIcons name="close" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalImageContainer}>
            {loading && <ActivityIndicator color={COLORS.button} />}
            {!loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!loading && imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.modalImage} resizeMode="contain" />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function DashboardScreen(): React.ReactElement {
  const auth = useContext(AuthContext);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        if (!auth.accessToken) return;
        setLoading(true);
        setError('');
        try {
          const [receiptsRes, budgetsRes] = await Promise.all([
            getReceipts(auth.accessToken),
            getBudgets(auth.accessToken),
          ]);
          if (!cancelled) {
            setReceipts(receiptsRes.receipts);
            setBudgets(budgetsRes.budgets);
          }
        } catch (err: any) {
          if (!cancelled) setError(err.message || 'Failed to load receipts');
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      load();
      return () => {
        cancelled = true;
      };
    }, [auth.accessToken])
  );

  const now = new Date();
  // Hero stats, category bars and budget % cover the current month only;
  // the "Recent Receipts" list below still shows the latest receipts overall.
  const monthReceipts = receiptsForMonth(receipts, now);
  const totalSpent = sumTotals(monthReceipts);
  const thisWeekSpent = sumTotals(receiptsSince(receipts, 7, now));
  const totalBudget = sumLimits(budgets);
  const budgetPercentage = budgetUsagePct(totalSpent, totalBudget);

  const categoryTotals = sortedCategoryTotals(monthReceipts);
  const budgetsByCategory = indexBudgetsByCategory(budgets);

  return (
    // White safe area so the status-bar strip matches the white header
    // (spec: "iOS status bar (white)"); the grey page starts below it.
    <SafeAreaView style={styles.safeArea} testID="dashboard-screen">
      {/* Header — full-bleed white bar, fixed above the scrolling content */}
      <View style={styles.header} testID="dashboard-header">
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting} testID="dashboard-greeting">{greetingFor(now)}</Text>
          <Text style={styles.title}>My Finances</Text>
        </View>
        <Avatar initials={auth.userEmail ? auth.userEmail.substring(0, 2).toUpperCase() : 'U'} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        testID="dashboard-scroll"
      >

        {/* Balance Card (Hero) */}
        <LinearGradient
          colors={[COLORS.button, COLORS.button]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroCardContent}>
            <Text style={styles.heroLabel}>SPENT THIS MONTH</Text>
            <Text style={styles.heroAmount} testID="hero-spent">{formatCurrency(totalSpent)}</Text>
            {totalBudget > 0 && (
              <Text style={styles.heroSubtitle}>of {formatCurrency(totalBudget)} budget</Text>
            )}

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue} testID="hero-week">{formatCurrency(thisWeekSpent)}</Text>
                <Text style={styles.statLabel}>This week</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: COLORS.heroStatsDivider }]} />
              <View style={styles.statItem}>
                <Text style={styles.statValue} testID="hero-count">{monthReceipts.length}</Text>
                <Text style={styles.statLabel}>Receipts</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: COLORS.heroStatsDivider }]} />
              <View style={styles.statItem}>
                <Text style={styles.statValue} testID="hero-budget-pct">{Math.round(budgetPercentage)}%</Text>
                <Text style={styles.statLabel}>Budget used</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={COLORS.button} />
          </View>
        )}

        {!loading && error ? (
          <View style={styles.section}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!loading && !error && receipts.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="receipt" size={40} color={COLORS.textSecondary} />
            <Text style={styles.emptyStateTitle}>No receipts yet</Text>
            <Text style={styles.emptyStateSubtitle}>Scan your first receipt to see it here</Text>
          </View>
        )}

        {!loading && categoryTotals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Spending by Category</Text>
            <View style={styles.categoryGrid} testID="category-grid">
              {categoryTotals.map((item) => (
                <CategoryItem
                  key={item.category}
                  item={item}
                  totalSpent={totalSpent}
                  budget={budgetsByCategory[item.category]}
                />
              ))}
            </View>
          </View>
        )}

        {!loading && receipts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Receipts</Text>
            {receipts.slice(0, 5).map((receipt) => (
              <ReceiptItem key={receipt.id} receipt={receipt} onPress={() => setSelectedReceipt(receipt)} />
            ))}
          </View>
        )}
      </ScrollView>

      {selectedReceipt && auth.accessToken && (
        <ReceiptImageModal
          receipt={selectedReceipt}
          accessToken={auth.accessToken}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingTop: 12,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  heroCard: {
    marginHorizontal: 12,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  heroCardContent: {
    gap: 12,
  },
  heroLabel: {
    color: COLORS.heroLabelOpacity,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroAmount: {
    color: COLORS.buttonText,
    fontSize: 34,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: COLORS.heroSubtextOpacity,
    fontSize: 12,
    fontWeight: '400',
  },
  statsRow: {
    backgroundColor: COLORS.heroStatsRowBg,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 4,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: COLORS.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  statLabel: {
    color: COLORS.heroStatsLabel,
    fontSize: 11,
    fontWeight: '400',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 20,
    marginHorizontal: 8,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 8,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  // Fixed 2-column grid: every card is exactly 48% wide (never flex-grows),
  // so an odd last card stays half-width instead of stretching. The 4%
  // column gutter comes from space-between, so two cards always fit.
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  categoryCard: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  categoryAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: COLORS.background,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  receiptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  receiptIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  receiptInfo: {
    flex: 1,
  },
  receiptMerchant: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  receiptDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  receiptAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.modalOverlay,
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  modalImageContainer: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: '100%',
    height: 320,
    borderRadius: 8,
  },
});
