import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { AuthContext, isSignedIn } from '../lib/auth';
import type { MainTabParamList } from '../lib/navigation';
import { initialsFor } from '../lib/profile';
import {
  getReceipts,
  getReceiptImageUrl,
  Receipt,
  getBudgets,
  Budget,
  updateItemCategories,
  deleteReceipt,
} from '../lib/api';
import { textDirectionStyle } from '../lib/rtl';
import { COLORS, RADIUS, budgetBarColor } from '../lib/theme';
import { RECEIPT_CATEGORIES, categoryMeta } from '../lib/categories';
import { errorMessage } from '../lib/errors';
import CategoryPicker from '../components/CategoryPicker';
import ReceiptItemsList from '../components/ReceiptItemsList';
import {
  CategoryTotal,
  budgetUsagePct,
  budgetsByCategory as indexBudgetsByCategory,
  formatReceiptDate,
  percentOf,
  receiptsForMonth,
  receiptsSince,
  sortedCategoryTotals,
  sumLimits,
  sumTotals,
} from '../lib/spending';
import { greetingFor } from '../lib/greeting';
import { formatCurrency } from '../lib/currency';

// Spec (Screen 3): 34px circle, light-grey (COLORS.background) bg, black initials — visible because
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
      <View style={styles.receiptInfo} testID={`receipt-info-${receipt.id}`}>
        <Text
          style={[styles.receiptMerchant, textDirectionStyle(receipt.raw_response.merchant)]}
          numberOfLines={1}
          ellipsizeMode="tail"
          testID={`receipt-merchant-${receipt.id}`}
        >
          {receipt.raw_response.merchant}
        </Text>
        <Text style={styles.receiptDate} testID={`receipt-date-${receipt.id}`}>
          {formatReceiptDate(receipt)}
        </Text>
      </View>
      <Text style={styles.receiptAmount} testID={`receipt-amount-${receipt.id}`}>
        {formatCurrency(receipt.raw_response.total, { decimals: 2 })}
      </Text>
    </TouchableOpacity>
  );
};

/** The image route answers 404 when the receipt was saved without a photo — a normal state, not an error. */
const NO_STORED_IMAGE_MESSAGE = 'This receipt has no stored image';

const ReceiptImageModal: React.FC<{
  receipt: Receipt;
  onClose: () => void;
  onReceiptUpdated: (receipt: Receipt) => void;
  onReceiptDeleted: (id: string) => void;
}> = ({ receipt, onClose, onReceiptUpdated, onReceiptDeleted }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noImage, setNoImage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [saveError, setSaveError] = useState('');
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const items = receipt.raw_response.items ?? [];

  // Saves immediately; the Dashboard swaps in the server's copy, so the
  // totals and category cards re-derive from it.
  const changeCategory = async (index: number, category: string) => {
    if (items[index]?.category === category) return;
    setSavingIndex(index);
    setSaveError('');
    try {
      const { receipt: updated } = await updateItemCategories(receipt.id, [{ index, category }]);
      if (mounted.current) onReceiptUpdated(updated);
    } catch (err: unknown) {
      if (mounted.current) setSaveError(errorMessage(err, 'Could not change the category. Please try again.'));
    } finally {
      if (mounted.current) setSavingIndex(null);
    }
  };

  const deleteNow = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteReceipt(receipt.id);
      // The Dashboard closes this modal and refreshes.
      if (mounted.current) onReceiptDeleted(receipt.id);
    } catch (err: unknown) {
      if (mounted.current) setDeleteError(errorMessage(err, 'Could not delete the receipt. Please try again.'));
    } finally {
      if (mounted.current) setDeleting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete receipt?',
      "This receipt and its items will be permanently deleted. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteNow() },
      ]
    );
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setNoImage(false);
    setImageUrl(null);

    getReceiptImageUrl(receipt.id)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch((err: { message?: string; code?: number | string } | undefined) => {
        if (cancelled) return;
        if (err?.code === 404) setNoImage(true);
        else setError(err?.message || 'No image available for this receipt');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [receipt.id]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText} testID="receipt-modal-header-text">
              <Text
                style={[styles.modalTitle, textDirectionStyle(receipt.raw_response.merchant)]}
                numberOfLines={2}
                ellipsizeMode="tail"
                testID="receipt-modal-title"
              >
                {receipt.raw_response.merchant}
              </Text>
              <Text style={styles.modalSubtitle}>
                {formatReceiptDate(receipt)} · {formatCurrency(receipt.raw_response.total, { decimals: 2 })}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={deleting} testID="receipt-modal-close">
              <MaterialCommunityIcons name="close" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} testID="receipt-modal-body">
            {items.length > 0 && (
              <View style={styles.modalItems}>
                <ReceiptItemsList
                  items={items}
                  onPressCategory={setPickerIndex}
                  savingIndex={savingIndex}
                  testIDPrefix="receipt-modal-item"
                />
                {saveError ? (
                  <Text style={styles.errorText} testID="receipt-modal-save-error">
                    {saveError}
                  </Text>
                ) : null}
              </View>
            )}

            <View style={styles.modalImageContainer}>
              {loading && <ActivityIndicator color={COLORS.button} />}
              {!loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
              {!loading && noImage ? (
                <View style={styles.noImage} testID="receipt-modal-no-image">
                  <MaterialCommunityIcons name="image-off-outline" size={28} color={COLORS.textSecondary} />
                  <Text style={styles.noImageText}>{NO_STORED_IMAGE_MESSAGE}</Text>
                </View>
              ) : null}
              {!loading && imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.modalImage} resizeMode="contain" />
              ) : null}
            </View>
          </ScrollView>

          {deleteError ? (
            <Text style={[styles.errorText, styles.deleteError]} testID="receipt-delete-error">
              {deleteError}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
            onPress={confirmDelete}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Delete receipt"
            accessibilityState={{ disabled: deleting, busy: deleting }}
            testID="receipt-delete-button"
          >
            {deleting ? (
              <ActivityIndicator color={COLORS.danger} testID="receipt-deleting" />
            ) : (
              <>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.danger} />
                <Text style={styles.deleteButtonText}>Delete receipt</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {pickerIndex !== null && items[pickerIndex] ? (
        <CategoryPicker
          visible
          categories={RECEIPT_CATEGORIES}
          selected={items[pickerIndex].category}
          subtitle={items[pickerIndex].name}
          onSelect={(category) => changeCategory(pickerIndex, category)}
          onClose={() => setPickerIndex(null)}
        />
      ) : null}
    </Modal>
  );
};

export default function DashboardScreen(): React.ReactElement {
  const auth = useContext(AuthContext);
  // Signed in or not — not the token itself: lib/api gets (and renews) the
  // token on its own, and a renewal must not re-trigger the loads below.
  // hasAccessToken flips false -> true only when a launch restore that
  // failed transiently finally renews: load again then.
  const hasSession = isSignedIn(auth);
  const hasAccessToken = auth.accessToken !== null;
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Hero summary: 'pending' until the first load settles, so the card shows
  // a placeholder instead of ₪0 / 0 receipts right after sign-in. Real zeros
  // only once data has loaded ('ready'); '—' if the first load failed.
  // Later reloads keep the previous numbers on screen.
  const [summary, setSummary] = useState<'pending' | 'ready' | 'failed'>('pending');
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  // Each load takes a number; only the latest may write state. Bumped on
  // blur/unmount so a response for a screen that went away is ignored.
  const loadSeq = useRef(0);
  // Derived from `receipts` so a saved category change shows in the open modal too.
  const selectedReceipt = receipts.find((r) => r.id === selectedReceiptId) ?? null;

  const replaceReceipt = useCallback((updated: Receipt) => {
    setReceipts((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  /**
   * Fetch receipts + budgets. `quiet` (refresh after a delete) keeps the
   * current lists on screen instead of swapping them for the spinner, and
   * leaves the on-screen data alone if the refresh fails.
   */
  const load = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (!hasSession) return;
      const seq = ++loadSeq.current;
      const current = () => seq === loadSeq.current;
      if (!quiet) {
        setLoading(true);
        setError('');
      }
      try {
        const [receiptsRes, budgetsRes] = await Promise.all([getReceipts(), getBudgets()]);
        if (current()) {
          setReceipts(receiptsRes.receipts);
          setBudgets(budgetsRes.budgets);
          setSummary('ready');
        }
      } catch (err: any) {
        if (current() && !quiet) {
          setError(err?.message || 'Failed to load receipts');
          setSummary((prev) => (prev === 'pending' ? 'failed' : prev));
        }
      } finally {
        if (current() && !quiet) setLoading(false);
      }
    },
    [hasSession]
  );

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        loadSeq.current++;
      };
    }, [load, hasAccessToken])
  );

  // Receipt deleted from the modal: close it, drop the row right away, then
  // refresh so totals/categories come from the server.
  const handleReceiptDeleted = useCallback(
    (id: string) => {
      setSelectedReceiptId(null);
      setReceipts((prev) => prev.filter((r) => r.id !== id));
      load({ quiet: true });
    },
    [load]
  );

  const now = new Date();
  // Hero stats, category bars and budget % cover the current month only;
  // the "Recent Receipts" list below still shows the latest receipts overall.
  const monthReceipts = receiptsForMonth(receipts, now);
  const totalSpent = sumTotals(monthReceipts);
  const thisWeekSpent = sumTotals(receiptsSince(receipts, 7, now));
  const totalBudget = sumLimits(budgets);
  const budgetPercentage = budgetUsagePct(totalSpent, totalBudget);
  // With no budget, "0% used" would read as "on track" — show a dash and
  // make the stat a shortcut to setting one up instead.
  const hasBudget = totalBudget > 0;
  const failed = summary === 'failed';

  const categoryTotals = sortedCategoryTotals(monthReceipts);
  const budgetsByCategory = indexBudgetsByCategory(budgets);

  return (
    // White safe area so the status-bar strip matches the white header
    // (spec: "iOS status bar (white)"); the grey page starts below it.
    <SafeAreaView style={styles.safeArea} testID="dashboard-screen">
      {/* Header — full-bleed white bar, fixed above the scrolling content */}
      <View style={styles.header} testID="dashboard-header">
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting} testID="dashboard-greeting">{greetingFor(now, auth.userName)}</Text>
          <Text style={styles.title}>My Finances</Text>
        </View>
        <Avatar initials={initialsFor(auth.userName, auth.userEmail)} />
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
          {summary === 'pending' ? (
            // First load in flight: placeholders, never ₪0 / 0 receipts.
            <View
              style={styles.heroCardContent}
              testID="hero-loading"
              accessible
              accessibilityLabel="Loading your spending"
              accessibilityState={{ busy: true }}
            >
              <Text style={styles.heroLabel}>SPENT THIS MONTH</Text>
              <View style={styles.heroSkeletonAmount} testID="hero-spent-skeleton" />
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <View style={styles.heroSkeletonStat} />
                  <Text style={styles.statLabel}>This week</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: COLORS.heroStatsDivider }]} />
                <View style={styles.statItem}>
                  <View style={styles.heroSkeletonStat} />
                  <Text style={styles.statLabel}>Receipts</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: COLORS.heroStatsDivider }]} />
                <View style={styles.statItem}>
                  <View style={styles.heroSkeletonStat} />
                  <Text style={styles.statLabel}>Budget</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.heroCardContent}>
              <Text style={styles.heroLabel}>SPENT THIS MONTH</Text>
              <Text style={styles.heroAmount} testID="hero-spent">{failed ? '—' : formatCurrency(totalSpent)}</Text>
              {totalBudget > 0 && (
                <Text style={styles.heroSubtitle}>of {formatCurrency(totalBudget)} budget</Text>
              )}

              {/* Stats row */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue} testID="hero-week">{failed ? '—' : formatCurrency(thisWeekSpent)}</Text>
                  <Text style={styles.statLabel}>This week</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: COLORS.heroStatsDivider }]} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue} testID="hero-count">{failed ? '—' : monthReceipts.length}</Text>
                  <Text style={styles.statLabel}>Receipts</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: COLORS.heroStatsDivider }]} />
                {failed ? (
                  // Budgets unknown: neither a % nor the "set a budget" shortcut.
                  <View style={styles.statItem} testID="hero-budget-stat">
                    <Text style={styles.statValue} testID="hero-budget-pct">—</Text>
                    <Text style={styles.statLabel} testID="hero-budget-label">Budget</Text>
                  </View>
                ) : hasBudget ? (
                  <View style={styles.statItem} testID="hero-budget-stat">
                    <Text style={styles.statValue} testID="hero-budget-pct">{Math.round(budgetPercentage)}%</Text>
                    <Text style={styles.statLabel} testID="hero-budget-label">Budget used</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.statItem}
                    onPress={() => navigation.navigate('Budget')}
                    accessibilityRole="button"
                    accessibilityLabel="No budget set. Set a budget"
                    testID="hero-budget-stat"
                  >
                    <Text style={styles.statValue} testID="hero-budget-pct">—</Text>
                    <Text style={styles.statLabel} testID="hero-budget-label">No budget</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
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
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => navigation.navigate('Scan')}
              accessibilityRole="button"
              testID="dashboard-scan-first"
            >
              <MaterialCommunityIcons name="camera-outline" size={18} color={COLORS.buttonText} />
              <Text style={styles.emptyStateButtonText}>Scan your first receipt</Text>
            </TouchableOpacity>
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
              <ReceiptItem key={receipt.id} receipt={receipt} onPress={() => setSelectedReceiptId(receipt.id)} />
            ))}
          </View>
        )}
      </ScrollView>

      {selectedReceipt && hasSession && (
        <ReceiptImageModal
          receipt={selectedReceipt}
          onClose={() => setSelectedReceiptId(null)}
          onReceiptUpdated={replaceReceipt}
          onReceiptDeleted={handleReceiptDeleted}
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
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 20,
    marginTop: 12,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.button,
  },
  emptyStateButtonText: {
    color: COLORS.buttonText,
    fontSize: 15,
    fontWeight: '600',
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
  // flex 1 + minWidth 0: takes the leftover width and may shrink below its
  // text, so a long merchant ellipsizes instead of running into the amount.
  // The name is start-aligned whatever its script (textDirectionStyle), so a
  // Hebrew merchant sits next to the icon exactly like an English one.
  receiptInfo: {
    flex: 1,
    minWidth: 0,
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
    flexShrink: 0,
    marginLeft: 12,
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
  modalHeaderText: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
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
  modalBody: {
    flexGrow: 0,
  },
  modalItems: {
    marginBottom: 12,
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
  // Receipt saved without a photo: a normal state, so neutral secondary
  // text (not the red error style).
  noImage: {
    alignItems: 'center',
    gap: 8,
  },
  noImageText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  deleteError: {
    marginTop: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    marginTop: 12,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.errorBg,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: COLORS.danger,
    fontSize: 15,
    fontWeight: '600',
  },
  heroSkeletonAmount: {
    width: 140,
    height: 34,
    borderRadius: 8,
    backgroundColor: COLORS.heroSkeleton,
  },
  heroSkeletonStat: {
    width: 44,
    height: 14,
    marginVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.heroSkeleton,
  },
});
