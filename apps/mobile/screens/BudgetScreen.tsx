import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../App';
import { getBudgets, getReceipts, upsertBudget, Budget, Receipt, RECEIPT_CATEGORIES } from '../lib/api';

const COLORS = {
  primary: '#1D9E75',
  primaryDark: '#0F6E56',
  alert: '#EF4444',
  warning: '#F59E0B',
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

interface BudgetWithSpend extends Budget {
  spent: number;
}

const AlertBanner: React.FC<{ overBudget: BudgetWithSpend[] }> = ({ overBudget }) => {
  if (overBudget.length === 0) return null;

  const names = overBudget.map((b) => b.category).join(' and ');

  return (
    <View style={styles.alertBanner}>
      <MaterialCommunityIcons name="alert-circle" size={20} color="#92400e" />
      <Text style={styles.alertText}>
        {names} {overBudget.length === 1 ? 'is' : 'are'} at 90%+ of budget
      </Text>
    </View>
  );
};

const BudgetItem: React.FC<{ item: BudgetWithSpend; onPress: () => void }> = ({ item, onPress }) => {
  const meta = categoryMeta(item.category);
  const percentage = (item.spent / item.monthly_limit) * 100;

  let barColor = '#16A34A'; // green, under 70%
  if (percentage >= 90) barColor = '#EF4444'; // red
  else if (percentage >= 70) barColor = '#F59E0B'; // amber

  return (
    <TouchableOpacity style={styles.budgetItem} onPress={onPress}>
      <View style={styles.budgetItemHeader}>
        <View style={styles.budgetItemLeft}>
          <View style={[styles.budgetItemIcon, { backgroundColor: meta.backgroundColor }]}>
            <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
          </View>
          <View>
            <Text style={styles.budgetItemName}>{item.category}</Text>
            <Text style={styles.budgetItemSpent}>
              ₪{item.spent.toFixed(0)} / ₪{item.monthly_limit.toFixed(0)}
            </Text>
          </View>
        </View>
        <View style={styles.budgetItemPercentage}>
          <Text
            style={[
              styles.budgetItemPercentageText,
              { color: percentage > 100 ? COLORS.alert : COLORS.textPrimary },
            ]}
          >
            {Math.min(Math.round(percentage), 999)}%
          </Text>
        </View>
      </View>
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${Math.min(percentage, 100)}%`, backgroundColor: barColor }]} />
      </View>
    </TouchableOpacity>
  );
};

export default function BudgetScreen(): React.ReactElement {
  const auth = useContext(AuthContext);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [modalCategory, setModalCategory] = useState<string>(RECEIPT_CATEGORIES[0]);
  const [modalLimit, setModalLimit] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        if (!auth.accessToken) return;
        setLoading(true);
        setError('');
        try {
          const [budgetsRes, receiptsRes] = await Promise.all([
            getBudgets(auth.accessToken),
            getReceipts(auth.accessToken),
          ]);
          if (!cancelled) {
            setBudgets(budgetsRes.budgets);
            setReceipts(receiptsRes.receipts);
          }
        } catch (err: any) {
          if (!cancelled) setError(err.message || 'Failed to load budgets');
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

  const categorySpend = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const receipt of receipts) {
      for (const item of receipt.raw_response.items) {
        totals[item.category] = (totals[item.category] || 0) + item.amount;
      }
    }
    return totals;
  }, [receipts]);

  const budgetsWithSpend: BudgetWithSpend[] = useMemo(
    () => budgets.map((b) => ({ ...b, spent: categorySpend[b.category] || 0 })),
    [budgets, categorySpend]
  );

  const overBudget = budgetsWithSpend.filter((b) => (b.spent / b.monthly_limit) * 100 >= 90);
  const totalSpent = budgetsWithSpend.reduce((sum, b) => sum + b.spent, 0);
  const totalBudget = budgetsWithSpend.reduce((sum, b) => sum + b.monthly_limit, 0);

  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const openAddModal = () => {
    setModalCategory(RECEIPT_CATEGORIES[0]);
    setModalLimit('');
    setModalVisible(true);
  };

  const openEditModal = (budget: Budget) => {
    setModalCategory(budget.category);
    setModalLimit(String(budget.monthly_limit));
    setModalVisible(true);
  };

  const saveBudget = async () => {
    const limitNumber = Number(modalLimit);
    if (!modalLimit || !(limitNumber > 0)) {
      Alert.alert('Invalid limit', 'Enter a limit greater than 0.');
      return;
    }
    if (!auth.accessToken) return;

    setSaving(true);
    try {
      await upsertBudget(modalCategory, limitNumber, auth.accessToken);
      const { budgets: updated } = await getBudgets(auth.accessToken);
      setBudgets(updated);
      setModalVisible(false);
    } catch (err: any) {
      Alert.alert('Failed to save budget', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

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
            <Text style={styles.monthText}>{currentMonth}</Text>
            <Text style={styles.title}>Budget</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
            <MaterialCommunityIcons name="plus" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

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

        {!loading && !error && (
          <AlertBanner overBudget={overBudget} />
        )}

        {!loading && !error && budgetsWithSpend.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="wallet-outline" size={40} color={COLORS.textSecondary} />
            <Text style={styles.emptyStateTitle}>No budgets set</Text>
            <Text style={styles.emptyStateSubtitle}>
              Tap the + button to set a monthly limit for a category
            </Text>
          </View>
        )}

        {!loading && budgetsWithSpend.length > 0 && (
          <>
            <View style={styles.section}>
              {budgetsWithSpend.map((item) => (
                <BudgetItem key={item.id} item={item} onPress={() => openEditModal(item)} />
              ))}
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Spent</Text>
                <Text style={styles.summaryValue}>₪{totalSpent.toFixed(0)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Budget</Text>
                <Text style={styles.summaryValue}>₪{totalBudget.toFixed(0)}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Remaining</Text>
                <Text style={[styles.summaryValue, { color: COLORS.primary }]}>
                  ₪{(totalBudget - totalSpent).toFixed(0)}
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set Budget</Text>

            <Text style={styles.modalLabel}>Category</Text>
            <View style={styles.categoryChips}>
              {RECEIPT_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, modalCategory === cat && styles.categoryChipSelected]}
                  onPress={() => setModalCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      modalCategory === cat && styles.categoryChipTextSelected,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Monthly limit (₪)</Text>
            <TextInput
              style={styles.modalInput}
              value={modalLimit}
              onChangeText={setModalLimit}
              keyboardType="numeric"
              placeholder="e.g. 1500"
              placeholderTextColor={COLORS.textSecondary}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={saveBudget} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.modalSaveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 16,
  },
  monthText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.alert,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
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
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    gap: 10,
  },
  alertText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#92400e',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  budgetItem: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  budgetItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  budgetItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  budgetItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  budgetItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  budgetItemSpent: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  budgetItemPercentage: {
    alignItems: 'center',
  },
  budgetItemPercentageText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  summaryCard: {
    marginHorizontal: 16,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 8,
    marginBottom: 8,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fafafa',
  },
  categoryChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  categoryChipTextSelected: {
    color: '#ffffff',
  },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fafafa',
    color: COLORS.textPrimary,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  modalSaveButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSaveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
