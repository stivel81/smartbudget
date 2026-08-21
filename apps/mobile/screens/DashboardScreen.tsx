import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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

const CATEGORIES = [
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
    spent: 520,
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

const RECENT_RECEIPTS = [
  {
    id: '1',
    merchant: 'Rami Levy',
    date: 'Today',
    amount: 127.50,
    category: 'groceries',
  },
  {
    id: '2',
    merchant: 'Café Aroma',
    date: 'Yesterday',
    amount: 45.00,
    category: 'dining',
  },
  {
    id: '3',
    merchant: 'Rav-Kav',
    date: '3 days ago',
    amount: 200.00,
    category: 'transport',
  },
];

interface AvatarProps {
  initials: string;
}

const Avatar: React.FC<AvatarProps> = ({ initials }) => (
  <View
    style={[
      styles.avatar,
      {
        backgroundColor: COLORS.primary,
      },
    ]}
  >
    <Text style={styles.avatarText}>{initials}</Text>
  </View>
);

interface CategoryItemProps {
  category: (typeof CATEGORIES)[0];
}

const CategoryItem: React.FC<CategoryItemProps> = ({ category }) => {
  const percentage = (category.spent / category.limit) * 100;

  return (
    <View style={styles.categoryCard}>
      <View
        style={[
          styles.categoryIconContainer,
          { backgroundColor: category.backgroundColor },
        ]}
      >
        <MaterialCommunityIcons
          name={category.icon as any}
          size={24}
          color={category.color}
        />
      </View>
      <Text style={styles.categoryName}>{category.name}</Text>
      <Text style={styles.categoryAmount}>
        ₪{category.spent.toFixed(0)}
      </Text>
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${Math.min(percentage, 100)}%`,
              backgroundColor:
                percentage < 70
                  ? '#16A34A'
                  : percentage < 90
                    ? '#F59E0B'
                    : '#EF4444',
            },
          ]}
        />
      </View>
    </View>
  );
};

interface ReceiptItemProps {
  receipt: (typeof RECENT_RECEIPTS)[0];
}

const ReceiptItem: React.FC<ReceiptItemProps> = ({ receipt }) => {
  const category = CATEGORIES.find((c) => c.id === receipt.category);

  return (
    <View style={styles.receiptItem}>
      <View
        style={[
          styles.receiptIconContainer,
          { backgroundColor: category?.backgroundColor },
        ]}
      >
        <MaterialCommunityIcons
          name={category?.icon as any}
          size={20}
          color={category?.color}
        />
      </View>
      <View style={styles.receiptInfo}>
        <Text style={styles.receiptMerchant}>{receipt.merchant}</Text>
        <Text style={styles.receiptDate}>{receipt.date}</Text>
      </View>
      <Text style={styles.receiptAmount}>₪{receipt.amount.toFixed(2)}</Text>
    </View>
  );
};

export default function DashboardScreen(): React.ReactElement {
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
                <Text style={styles.balanceLabel}>Spent this month</Text>
                <Text style={styles.balanceAmount}>₪2,847</Text>
              </View>
              <View style={styles.budgetPercentage}>
                <Text style={styles.percentageText}>68%</Text>
                <Text style={styles.percentageLabel}>of budget</Text>
              </View>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceRow}>
              <View>
                <Text style={styles.balanceLabel}>This week</Text>
                <Text style={styles.weekAmount}>₪485</Text>
              </View>
              <View>
                <Text style={styles.balanceLabel}>Receipts</Text>
                <Text style={styles.receiptCount}>12</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Categories Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending by Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((category) => (
              <CategoryItem key={category.id} category={category} />
            ))}
          </View>
        </View>

        {/* Recent Receipts Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Receipts</Text>
          {RECENT_RECEIPTS.map((receipt) => (
            <ReceiptItem key={receipt.id} receipt={receipt} />
          ))}
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
  weekAmount: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  receiptCount: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  budgetPercentage: {
    alignItems: 'flex-end',
  },
  percentageText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  percentageLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    marginTop: 4,
  },
  balanceDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
});
