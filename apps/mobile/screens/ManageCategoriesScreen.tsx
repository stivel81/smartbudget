import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import type { CategoryUpdate } from '../lib/api';
import {
  CATEGORY_NAME_MAX_LENGTH,
  CATEGORY_NAME_TAKEN_MESSAGE,
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_CATEGORY_DEFAULT_COLOR,
  CUSTOM_CATEGORY_DEFAULT_ICON,
  CUSTOM_CATEGORY_ICONS,
  categoryErrorMessage,
  categoryTint,
  isCategoryNameTaken,
  validateCategoryName,
  type CategoryInfo,
} from '../lib/categories';
import { useCategories } from '../lib/categoriesContext';
import type { SignedInStackParamList } from '../lib/navigation';
import { COLORS, FONT_FAMILY, RADIUS, SPACING } from '../lib/theme';

const SAVE_NETWORK_ERROR = 'Could not save the category. Check your connection and try again.';
const DELETE_NETWORK_ERROR = 'Could not delete the category. Check your connection and try again.';

/** The consequence shown before a delete (the server does exactly this). */
export function deleteCategoryMessage(name: string): string {
  return `Items in ${name} will move to Other and its budget will be removed.`;
}

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Add (no `editing`) or edit one of the user's categories. */
interface EditorState {
  editing: CategoryInfo | null;
  name: string;
  icon: string;
  color: string;
}

const CategoryTile: React.FC<{ icon: string; color: string; backgroundColor: string; testID?: string }> = ({
  icon,
  color,
  backgroundColor,
  testID,
}) => (
  <View style={[styles.tile, { backgroundColor }]} testID={testID}>
    <MaterialCommunityIcons name={icon as IconName} size={18} color={color} />
  </View>
);

export default function ManageCategoriesScreen(): React.ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<SignedInStackParamList>>();
  const {
    categories,
    customCategories,
    status,
    loaded,
    refresh,
    createCategory,
    updateCategory,
    deleteCategory,
  } = useCategories();
  const baseCategories = categories.filter((c) => c.isBase);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  // Fresh list whenever the screen opens (another device may have changed it).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openAdd = () => {
    setEditorError('');
    setEditor({ editing: null, name: '', icon: CUSTOM_CATEGORY_DEFAULT_ICON, color: CUSTOM_CATEGORY_DEFAULT_COLOR });
  };

  const openEdit = (category: CategoryInfo) => {
    setEditorError('');
    setEditor({ editing: category, name: category.name, icon: category.icon, color: category.color });
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(null);
    setEditorError('');
  };

  const save = async () => {
    if (!editor || saving) return;
    const name = editor.name.trim();
    const invalid = validateCategoryName(name);
    if (invalid) {
      setEditorError(invalid);
      return;
    }
    if (isCategoryNameTaken(categories, name, editor.editing?.id)) {
      setEditorError(CATEGORY_NAME_TAKEN_MESSAGE);
      return;
    }

    let updates: CategoryUpdate | null = null;
    if (editor.editing) {
      updates = {};
      if (name !== editor.editing.name) updates.name = name;
      if (editor.icon !== editor.editing.icon) updates.icon = editor.icon;
      if (editor.color !== editor.editing.color) updates.color = editor.color;
      if (Object.keys(updates).length === 0) {
        setEditor(null);
        return;
      }
    }

    setSaving(true);
    setEditorError('');
    try {
      if (editor.editing && updates) {
        await updateCategory(editor.editing.id, updates);
      } else {
        await createCategory({ name, icon: editor.icon, color: editor.color });
      }
      if (mounted.current) setEditor(null);
    } catch (err: unknown) {
      if (mounted.current) setEditorError(categoryErrorMessage(err, SAVE_NETWORK_ERROR));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const deleteNow = async (category: CategoryInfo) => {
    setDeletingId(category.id);
    try {
      await deleteCategory(category.id);
    } catch (err: unknown) {
      Alert.alert('Could not delete category', categoryErrorMessage(err, DELETE_NETWORK_ERROR));
    } finally {
      if (mounted.current) setDeletingId(null);
    }
  };

  const confirmDelete = (category: CategoryInfo) => {
    Alert.alert(`Delete ${category.name}?`, deleteCategoryMessage(category.name), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteNow(category) },
    ]);
  };

  const showInitialLoading = !loaded && status === 'loading';
  const showLoadError = !loaded && status === 'error';

  return (
    <SafeAreaView style={styles.safeArea} testID="categories-screen">
      <ScreenHeader
        title="Categories"
        backLabel="Profile"
        onBack={() => navigation.goBack()}
        testIDPrefix="categories"
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="categories-scroll"
      >
        {showLoadError ? (
          <View style={styles.notice} testID="categories-load-error">
            <Text style={styles.noticeText}>Couldn't load your categories.</Text>
            <TouchableOpacity
              onPress={() => void refresh()}
              accessibilityRole="button"
              testID="categories-retry-button"
            >
              <Text style={styles.noticeAction}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Built-in</Text>
        <View style={styles.card} testID="categories-base-list">
          {baseCategories.map((category, index) => (
            <View
              key={category.id}
              style={[styles.row, index < baseCategories.length - 1 && styles.rowDivider]}
              accessible
              accessibilityLabel={`${category.name}, built-in category, can't be edited`}
              testID={`category-item-${category.name}`}
            >
              <CategoryTile
                icon={category.icon}
                color={category.color}
                backgroundColor={category.backgroundColor}
                testID={`category-icon-${category.name}`}
              />
              <Text style={styles.rowName} numberOfLines={1}>
                {category.name}
              </Text>
              <View testID={`category-base-lock-${category.name}`}>
                <MaterialCommunityIcons name="lock-outline" size={16} color={COLORS.textSecondary} />
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Your categories</Text>
        <View style={styles.card} testID="categories-custom-list">
          {showInitialLoading ? (
            <View style={styles.emptyRow}>
              <ActivityIndicator color={COLORS.button} testID="categories-loading" />
            </View>
          ) : customCategories.length === 0 ? (
            <View style={styles.emptyRow} testID="categories-empty">
              <Text style={styles.emptyText}>No custom categories yet</Text>
            </View>
          ) : (
            customCategories.map((category, index) => {
              const deleting = deletingId === category.id;
              const rowDisabled = deletingId !== null;
              return (
                <View
                  key={category.id}
                  style={[styles.row, index < customCategories.length - 1 && styles.rowDivider]}
                  testID={`category-item-${category.name}`}
                >
                  <CategoryTile
                    icon={category.icon}
                    color={category.color}
                    backgroundColor={category.backgroundColor}
                    testID={`category-icon-${category.name}`}
                  />
                  <Text style={styles.rowName} numberOfLines={1}>
                    {category.name}
                  </Text>
                  {deleting ? (
                    <ActivityIndicator color={COLORS.danger} testID={`category-deleting-${category.name}`} />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.rowAction}
                        onPress={() => openEdit(category)}
                        disabled={rowDisabled}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${category.name}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        testID={`category-edit-${category.name}`}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={18} color={COLORS.textPrimary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rowAction}
                        onPress={() => confirmDelete(category)}
                        disabled={rowDisabled}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${category.name}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        testID={`category-delete-${category.name}`}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.danger} />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={openAdd}
          accessibilityRole="button"
          testID="categories-add-button"
        >
          <MaterialCommunityIcons name="plus" size={18} color={COLORS.buttonText} />
          <Text style={styles.addButtonText}>Add category</Text>
        </TouchableOpacity>
        <Text style={styles.footnote}>
          Custom categories show up when you scan receipts, change an item's category, and set budgets.
        </Text>
      </ScrollView>

      <Modal visible={editor !== null} transparent animationType="slide" onRequestClose={closeEditor}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          testID="category-editor"
        >
          {editor ? (
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <CategoryTile
                  icon={editor.icon}
                  color={editor.color}
                  backgroundColor={categoryTint(editor.color)}
                  testID="category-editor-preview"
                />
                <Text style={styles.modalTitle} accessibilityRole="header">
                  {editor.editing ? 'Edit category' : 'New category'}
                </Text>
              </View>

              <Text style={styles.modalLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={editor.name}
                onChangeText={(name) => {
                  setEditor((prev) => (prev ? { ...prev, name } : prev));
                  setEditorError('');
                }}
                placeholder="e.g. Pets"
                placeholderTextColor={COLORS.placeholder}
                maxLength={CATEGORY_NAME_MAX_LENGTH}
                autoCorrect={false}
                editable={!saving}
                returnKeyType="done"
                onSubmitEditing={() => void save()}
                testID="category-name-input"
              />

              <Text style={styles.modalLabel}>Icon</Text>
              <View style={styles.optionGrid} testID="category-icon-options">
                {CUSTOM_CATEGORY_ICONS.map((icon) => {
                  const selected = editor.icon === icon;
                  return (
                    <TouchableOpacity
                      key={icon}
                      style={[styles.iconOption, selected && styles.iconOptionSelected]}
                      onPress={() => setEditor((prev) => (prev ? { ...prev, icon } : prev))}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel={`Icon ${icon}`}
                      accessibilityState={{ selected }}
                      testID={`category-icon-option-${icon}`}
                    >
                      <MaterialCommunityIcons
                        name={icon as IconName}
                        size={20}
                        color={selected ? COLORS.buttonText : COLORS.textPrimary}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.modalLabel}>Color</Text>
              <View style={styles.optionGrid} testID="category-color-options">
                {CUSTOM_CATEGORY_COLORS.map((color) => {
                  const selected = editor.color.toLowerCase() === color.toLowerCase();
                  const key = color.slice(1).toUpperCase();
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[styles.colorOption, { backgroundColor: color }, selected && styles.colorOptionSelected]}
                      onPress={() => setEditor((prev) => (prev ? { ...prev, color } : prev))}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel={`Color ${key}`}
                      accessibilityState={{ selected }}
                      testID={`category-color-option-${key}`}
                    >
                      {selected ? <MaterialCommunityIcons name="check" size={16} color={COLORS.buttonText} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {editorError ? (
                <Text style={styles.errorText} testID="category-editor-error" accessibilityLiveRegion="polite">
                  {editorError}
                </Text>
              ) : null}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={closeEditor}
                  disabled={saving}
                  accessibilityRole="button"
                  testID="category-cancel-button"
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={() => void save()}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: saving, busy: saving }}
                  testID="category-save-button"
                >
                  {saving ? (
                    <ActivityIndicator color={COLORS.buttonText} testID="category-saving" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
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
  content: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.sectionMargin,
    paddingBottom: 32,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.errorBg,
    borderRadius: RADIUS.card,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: SPACING.sectionMargin,
  },
  noticeText: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: COLORS.danger,
  },
  noticeAction: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginLeft: 12,
  },
  sectionLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    marginBottom: SPACING.sectionMargin,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowName: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '400',
    color: COLORS.textPrimary,
  },
  rowAction: {
    padding: 4,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.categoryIcon,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyRow: {
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  addButton: {
    height: 48,
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    backgroundColor: COLORS.button,
    borderRadius: RADIUS.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.buttonText,
  },
  footnote: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 10,
    marginHorizontal: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.modalOverlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.screenPadding + 4,
    paddingTop: 20,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  modalTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: 14,
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconOption: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.categoryIcon,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconOptionSelected: {
    backgroundColor: COLORS.button,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  colorOptionSelected: {
    borderColor: COLORS.textPrimary,
  },
  errorText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: COLORS.danger,
    marginTop: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  saveButton: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.buttonText,
  },
});
