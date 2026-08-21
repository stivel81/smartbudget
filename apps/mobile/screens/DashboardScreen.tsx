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
import { AuthContext } from '../App';
import { getReceipts, getReceiptImageUrl, Receipt } from '../lib/api';

// Design tokens
const COLORS = {
  primary: '#1D9E75',
  primaryDark: '#0F6E56',
  background: '#f5f5f7',
  card: '#ffffff',
  border: '#e5e5e5',
  textPrimary: '#1a1a1a',
  textSecondary: '#666666',
};

// Must stay in sync with RECEIPT_CATEGORIES in apps/backend/src/services/claude.ts
const CATEGORY_META: Record<string, { icon: string; backgroundColor: string; color: string }> = {
  Groceries: { icon: 'cart', backgroundColor: '#E1F5EE', color: '#0F6E56' },
  Dining: { icon: 'silverware-fork-knife', backgroundColor: '#FEF3C7', color: '#D97706' },
  Transport: { icon: 'bus', backgroundColor: '#EEF2FF', color: '#4F46E5' },
  Entertainment: { icon: 'television', backgroundColor: '#FEE2E2', color: '#DC2626' },
  Health: { icon: 'heart', backgroundColor: '#F0FDF4', color: '#16A34A' },
  Other: { icon: 'dots-horizontal', backgroundColor: '#F3F4F6', color: '#6B7280' },
};

function categoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.Other;
}

interface CategoryTotal {
  category: string;
  spent: number;
}

const Avatar: React.FC<{ initials: string }> = ({ initials }) => (
  <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}>
    <Text style={styles.avatarText}>{initials}</Text>
  </View>
);

const CategoryItem: React.FC<{ item: CategoryTotal; totalSpent: number }> = ({
  item,
  totalSpent,
}) => {
  const meta = categoryMeta(item.category);
  const share = totalSpent > 0 ? (item.spent / totalSpent) * 100 : 0;

  return (
    <View style={styles.categoryCard}>
      <View style={[styles.categoryIconContainer, { backgroundColor: meta.backgroundColor }]}>
        <MaterialCommunityIcons name={meta.icon as any} size={24} color={meta.color} />
      </View>
      <Text style={styles.categoryName}>{item.category}</Text>
      <Text style={styles.categoryAmount}>₪{item.spent.toFixed(0)}</Text>
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBar,
            { width: `${Math.min(share, 100)}%`, backgroundColor: COLORS.primary },
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
        <Text style={styles.receiptMerchant}>{receipt.raw_response.merchant}</Text>
        <Text style={styles.receiptDate}>{receipt.raw_response.date}</Text>
      </View>
      <Text style={styles.receiptAmount}>₪{receipt.raw_response.total.toFixed(2)}</Text>
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
              <Text style={styles.modalTitle}>{receipt.raw_response.merchant}</Text>
              <Text style={styles.modalSubtitle}>
                {receipt.raw_response.date} · ₪{receipt.raw_response.total.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} testID="receipt-modal-close">
              <MaterialCommunityIcons name="close" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalImageContainer}>
            {loading && <ActivityIndicator color={COLORS.primary} />}
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
          const { receipts: data } = await getReceipts(auth.accessToken);
          if (!cancelled) setReceipts(data);
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

  const totalSpent = receipts.reduce((sum, r) => sum + r.raw_response.total, 0);

  const categoryTotals: CategoryTotal[] = Object.values(
    receipts
      .flatMap((r) => r.raw_response.items)
      .reduce<Record<string, CategoryTotal>>((acc, item) => {
        acc[item.category] = acc[item.category] || { category: item.category, spent: 0 };
        acc[item.category].spent += item.amount;
        return acc;
      }, {})
  ).sort((a, b) => b.spent - a.spent);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hi, Adrian</Text>
            <Text style={styles.subGreeting}>Welcome back</Text>
          </View>
          <Avatar initials="AS" />
        </View>

        {/* Balance Card */}
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <View style={styles.balanceCardContent}>
            <View style={styles.balanceRow}>
              <View>
                <Text style={styles.balanceLabel}>Total spent</Text>
                <Text style={styles.balanceAmount}>₪{totalSpent.toFixed(0)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.balanceLabel}>Receipts</Text>
                <Text style={styles.receiptCount}>{receipts.length}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={COLORS.primary} />
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
            <View style={styles.categoryGrid}>
              {categoryTotals.map((item) => (
                <CategoryItem key={item.category} item={item} totalSpent={totalSpent} />
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subGreeting: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  balanceCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  balanceCardContent: {
    gap: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  balanceLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '500',
  },
  balanceAmount: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
  receiptCount: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
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
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: COLORS.card,
    borderRadius: 10,
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
    backgroundColor: COLORS.border,
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
    backgroundColor: COLORS.card,
    borderRadius: 10,
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.card,
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
