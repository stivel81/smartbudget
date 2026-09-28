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
import { COLORS, CATEGORY_META, budgetBarColor, ALERT_THRESHOLD_PCT, DANGER_THRESHOLD_PCT } from '../lib/theme';

function categoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.Other;
}

interface BudgetWithSpend extends Budget {
  spent: number;
}

const AlertBanner: React.FC<{ overBudget: BudgetWithSpend[]; overDanger: BudgetWithSpend[] }> = ({
  overBudget,
  overDanger,
}) => {
  if (overBudget.length === 0) return null;

  const isRed = overDanger.length > 0;
  const names = (isRed ? overDanger : overBudget).map((b) => b.category).join(' and ');

  return (
    <View
      style={[
        styles.alertBanner,
        isRed && {
          backgroundColor: COLORS.danger,
          borderLeftColor: COLORS.danger,
        },
      ]}
    >
      <MaterialCommunityIcons
        name="alert-circle"
        size={20}
        color={isRed ? COLORS.buttonText : COLORS.warning}
      />
      <Text style={[styles.alertText, isRed && { color: COLORS.buttonText }]}>
        {names} {overDanger.length === 1 ? 'is' : 'are'} at {isRed ? '100%+' : `${ALERT_THRESHOLD_PCT}%+`} of budget
      </Text>
    </View>
  );
};

const BudgetItem: React.FC<{ item: BudgetWithSpend; onPress: () => void }> = ({ item, onPress }) => {
  const meta = categoryMeta(item.category);
  const percentage = (item.spent / item.monthly_limit) * 100;
  const barColor = budgetBarColor(percentage);

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
              { color: percentage > 100 ? COLORS.danger : COLORS.textPrimary },
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

  const overBudget = budgetsWithSpend.filter(
    (b) => (b.spent / b.monthly_limit) * 100 >= ALERT_THRESHOLD_PCT
  );
  const overDanger = budgetsWithSpend.filter((b) => (b.spent / b.monthly_limit) * 100 >= DANGER_THRESHOLD_PCT);
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
            <MaterialCommunityIcons name="plus" size={24} color={COLORS.button} />
          </TouchableOpacity>
        </View>

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

        {!loading && !error && (
          <AlertBanner overBudget={overBudget} overDanger={overDanger} />
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
                <Text style={[styles.summaryValue, { color: COLORS.success }]}>
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
                  <ActivityIndicator color={COLORS.buttonText} />
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
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '400',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  addButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.danger,
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
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.alertBg,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.alertBorder,
    gap: 10,
  },
  alertText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.alertTextColor,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  budgetItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
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
    height: 4,
    backgroundColor: COLORS.background,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  summaryCard: {
    marginHorizontal: 16,
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.chipBg,
  },
  categoryChipSelected: {
    backgroundColor: COLORS.button,
    borderColor: COLORS.button,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  categoryChipTextSelected: {
    color: COLORS.buttonText,
  },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    backgroundColor: COLORS.chipBg,
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
    backgroundColor: COLORS.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSaveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.buttonText,
  },
});
