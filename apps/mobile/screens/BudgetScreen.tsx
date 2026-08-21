import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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

const BUDGET_ITEMS = [
  {
    id: 'groceries',
    name: 'Groceries',
    icon: 'cart',
    backgroundColor: '#E1F5EE',
    color: '#0F6E56',
    spent: 950,
    limit: 1500,
  },
  {
    id: 'dining',
    name: 'Dining',
    icon: 'silverware-fork-knife',
    backgroundColor: '#FEF3C7',
    color: '#D97706',
    spent: 760,
    limit: 800,
  },
  {
    id: 'transport',
    name: 'Transport',
    icon: 'bus',
    backgroundColor: '#EEF2FF',
    color: '#4F46E5',
    spent: 350,
    limit: 500,
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    icon: 'television',
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
    spent: 180,
    limit: 400,
  },
  {
    id: 'health',
    name: 'Health',
    icon: 'heart',
    backgroundColor: '#F0FDF4',
    color: '#16A34A',
    spent: 247,
    limit: 500,
  },
];

interface AlertBannerProps {
  show: boolean;
  overBudgetCategories: string[];
}

const AlertBanner: React.FC<AlertBannerProps> = ({ show, overBudgetCategories }) => {
  if (!show || overBudgetCategories.length === 0) {
    return null;
  }

  const categoryNames = overBudgetCategories.join(' and ');

  return (
    <View style={styles.alertBanner}>
      <MaterialCommunityIcons name="alert-circle" size={20} color="#92400e" />
      <Text style={styles.alertText}>
        {categoryNames} {overBudgetCategories.length === 1 ? 'is' : 'are'} at 90%+
        of budget
      </Text>
    </View>
  );
};

interface BudgetItemProps {
  item: (typeof BUDGET_ITEMS)[0];
}

const BudgetItem: React.FC<BudgetItemProps> = ({ item }) => {
  const percentage = (item.spent / item.limit) * 100;
  const isOverBudget = percentage > 100;
  const isWarning = percentage >= 90 && percentage <= 100;
  const isAlert = percentage >= 70 && percentage < 90;
  const isHealthy = percentage < 70;

  let barColor = '#16A34A'; // green
  if (isOverBudget) {
    barColor = '#EF4444'; // red
  } else if (isWarning) {
    barColor = '#EF4444'; // red
  } else if (isAlert) {
    barColor = '#F59E0B'; // amber
  }

  return (
    <View style={styles.budgetItem}>
      <View style={styles.budgetItemHeader}>
        <View style={styles.budgetItemLeft}>
          <View
            style={[
              styles.budgetItemIcon,
              { backgroundColor: item.backgroundColor },
            ]}
          >
            <MaterialCommunityIcons
              name={item.icon as any}
              size={20}
              color={item.color}
            />
          </View>
          <View>
            <Text style={styles.budgetItemName}>{item.name}</Text>
            <Text style={styles.budgetItemSpent}>
              ₪{item.spent.toFixed(0)} / ₪{item.limit.toFixed(0)}
            </Text>
          </View>
        </View>
        <View style={styles.budgetItemPercentage}>
          <Text
            style={[
              styles.budgetItemPercentageText,
              {
                color: isOverBudget ? '#EF4444' : COLORS.textPrimary,
              },
            ]}
          >
            {Math.min(Math.round(percentage), 999)}%
          </Text>
        </View>
      </View>
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${Math.min(percentage, 100)}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
};

export default function BudgetScreen(): React.ReactElement {
  const overBudgetCategories = useMemo(() => {
    return BUDGET_ITEMS.filter((item) => (item.spent / item.limit) * 100 >= 90)
      .map((item) => item.name);
  }, []);

  const currentMonth = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

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
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              /* Add budget functionality would go here */
            }}
          >
            <MaterialCommunityIcons
              name="plus"
              size={24}
              color={COLORS.primary}
            />
          </TouchableOpacity>
        </View>

        {/* Alert Banner */}
        <AlertBanner show={true} overBudgetCategories={overBudgetCategories} />

        {/* Budget Items */}
        <View style={styles.section}>
          {BUDGET_ITEMS.map((item) => (
            <BudgetItem key={item.id} item={item} />
          ))}
        </View>

        {/* Total Summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Spent</Text>
            <Text style={styles.summaryValue}>₪2,487</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Budget</Text>
            <Text style={styles.summaryValue}>₪4,200</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Remaining</Text>
            <Text style={[styles.summaryValue, { color: COLORS.primary }]}>
              ₪1,713
            </Text>
          </View>
        </View>
      </ScrollView>
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
});
