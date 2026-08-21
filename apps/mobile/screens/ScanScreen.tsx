import React, { useState, useRef, useEffect, useContext } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  Dimensions,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { scanReceipt, updateReceipt, deleteReceipt } from '../lib/api';
import { AuthContext } from '../App';

// Claude resizes any image above this (long edge) before billing/processing
// it, so uploading larger buys nothing — this is also the size we store.
const MAX_IMAGE_DIMENSION = 1568;
const IMAGE_COMPRESSION = 0.7;

async function resizeForUpload(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri);
  const longEdge = Math.max(asset.width, asset.height);
  if (longEdge > MAX_IMAGE_DIMENSION) {
    if (asset.width >= asset.height) {
      context.resize({ width: MAX_IMAGE_DIMENSION });
    } else {
      context.resize({ height: MAX_IMAGE_DIMENSION });
    }
  }

  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: IMAGE_COMPRESSION, base64: true });
  context.release();
  image.release();

  if (!result.base64) {
    throw new Error('Failed to process image');
  }
  return result.base64;
}

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

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');
const CAMERA_HEIGHT = screenHeight * 0.65;

interface AIResult {
  id: string;
  merchant: string;
  category: string;
  date: string;
  total: number;
}

const CATEGORIES = [
  { id: 'groceries', name: 'Groceries', icon: 'cart' },
  { id: 'dining', name: 'Dining', icon: 'silverware-fork-knife' },
  { id: 'transport', name: 'Transport', icon: 'bus' },
  { id: 'entertainment', name: 'Entertainment', icon: 'television' },
  { id: 'health', name: 'Health', icon: 'heart' },
];

interface CornerGuideProps {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

const CornerGuide: React.FC<CornerGuideProps> = ({ position }) => {
  const styles: Record<string, any> = {
    'top-left': {
      top: 20,
      left: 20,
      borderTopWidth: 2,
      borderLeftWidth: 2,
    },
    'top-right': {
      top: 20,
      right: 20,
      borderTopWidth: 2,
      borderRightWidth: 2,
    },
    'bottom-left': {
      bottom: 20,
      left: 20,
      borderBottomWidth: 2,
      borderLeftWidth: 2,
    },
    'bottom-right': {
      bottom: 20,
      right: 20,
      borderBottomWidth: 2,
      borderRightWidth: 2,
    },
  };

  return (
    <View
      style={[
        componentStyles.cornerGuide,
        styles[position],
        { borderColor: '#22c55e' },
      ]}
    />
  );
};

export default function ScanScreen(): React.ReactElement {
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [editedMerchant, setEditedMerchant] = useState('');
  const [editedTotal, setEditedTotal] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const auth = useContext(AuthContext);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  // Animate scan line continuously
  useEffect(() => {
    const animateScanLine = () => {
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: CAMERA_HEIGHT - 40,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ]).start(() => animateScanLine());
    };

    animateScanLine();

    return () => scanLineAnim.setValue(0);
  }, [scanLineAnim]);

  const showResultCard = (result: AIResult) => {
    setResult(result);
    setEditedMerchant(result.merchant);
    setEditedTotal(result.total.toFixed(2));
    setShowResult(true);

    // Animate result card sliding up
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const processImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!auth.accessToken) {
      Alert.alert('Not signed in', 'Please sign in again to scan a receipt.');
      return;
    }

    setLoading(true);
    try {
      const base64 = await resizeForUpload(asset);
      const { receipt } = await scanReceipt(base64, 'image/jpeg', auth.accessToken);
      const extraction = receipt.raw_response;
      const categories = Array.from(new Set(extraction.items.map((item) => item.category)));

      showResultCard({
        id: receipt.id,
        merchant: extraction.merchant,
        category: categories.length > 0 ? categories.join(', ') : 'Uncategorized',
        date: extraction.date,
        total: extraction.total,
      });
    } catch (err: any) {
      Alert.alert('Scan failed', err.message || 'Could not analyze this receipt.');
    } finally {
      setLoading(false);
    }
  };

  const handleCapture = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission required', 'Enable camera access to scan a receipt.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0]);
    }
  };

  const handlePickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo library permission required', 'Enable photo access to select a receipt.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0]);
    }
  };

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 300,
      useNativeDriver: false,
    }).start(() => {
      setShowResult(false);
      setResult(null);
    });
  };

  const handleCancel = async () => {
    if (!result || !auth.accessToken) {
      handleDismiss();
      return;
    }

    setDiscarding(true);
    try {
      await deleteReceipt(result.id, auth.accessToken);
      handleDismiss();
    } catch (err: any) {
      Alert.alert('Failed to discard', err.message || 'Please try again.');
    } finally {
      setDiscarding(false);
    }
  };

  const handleConfirm = async () => {
    if (!result || !auth.accessToken) {
      handleDismiss();
      return;
    }

    const totalNumber = Number(editedTotal);
    if (!editedMerchant.trim()) {
      Alert.alert('Merchant required', 'Merchant name cannot be empty.');
      return;
    }
    if (!editedTotal || !(totalNumber > 0)) {
      Alert.alert('Invalid total', 'Total must be a positive number.');
      return;
    }

    const merchantChanged = editedMerchant.trim() !== result.merchant;
    const totalChanged = totalNumber !== result.total;

    if (!merchantChanged && !totalChanged) {
      handleDismiss();
      return;
    }

    setConfirming(true);
    try {
      await updateReceipt(
        result.id,
        {
          ...(merchantChanged && { merchant: editedMerchant.trim() }),
          ...(totalChanged && { total: totalNumber }),
        },
        auth.accessToken
      );
      handleDismiss();
    } catch (err: any) {
      Alert.alert('Failed to save changes', err.message || 'Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <SafeAreaView style={componentStyles.container}>
      {/* Camera Viewfinder */}
      <View style={componentStyles.cameraViewfinder}>
        {/* Corner Guides */}
        <CornerGuide position="top-left" />
        <CornerGuide position="top-right" />
        <CornerGuide position="bottom-left" />
        <CornerGuide position="bottom-right" />

        {/* Animated Scan Line */}
        <Animated.View
          style={[
            componentStyles.scanLine,
            {
              transform: [{ translateY: scanLineAnim }],
            },
          ]}
        />

        {/* Instruction Text */}
        <View style={componentStyles.instructionOverlay}>
          <Text style={componentStyles.instructionText}>
            Position receipt within frame
          </Text>
        </View>
      </View>

      {/* Camera Controls */}
      <View style={componentStyles.controls}>
        <TouchableOpacity
          style={componentStyles.controlButton}
          onPress={handlePickFromGallery}
          disabled={loading}
        >
          <MaterialCommunityIcons name="image" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={componentStyles.captureButton}
          onPress={handleCapture}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <View style={componentStyles.captureButtonInner} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={componentStyles.controlButton}
          onPress={() => {
            /* Flash toggle would go here */
          }}
        >
          <MaterialCommunityIcons
            name="flash"
            size={24}
            color={COLORS.textPrimary}
          />
        </TouchableOpacity>
      </View>

      {/* AI Result Card */}
      {showResult && result && (
        <Animated.View
          style={[
            componentStyles.resultCard,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={componentStyles.resultContent}>
            {/* Header */}
            <View style={componentStyles.resultHeader}>
              <Text style={componentStyles.resultTitle}>Extraction Complete</Text>
              <TouchableOpacity onPress={handleDismiss}>
                <MaterialCommunityIcons
                  name="close"
                  size={24}
                  color={COLORS.textPrimary}
                />
              </TouchableOpacity>
            </View>

            {/* Result Items */}
            <View style={componentStyles.resultItem}>
              <Text style={componentStyles.resultLabel}>Merchant</Text>
              <TextInput
                style={componentStyles.resultInput}
                value={editedMerchant}
                onChangeText={setEditedMerchant}
                editable={!confirming && !discarding}
              />
            </View>

            <View style={componentStyles.resultItem}>
              <Text style={componentStyles.resultLabel}>Category</Text>
              <Text style={componentStyles.resultValue}>{result.category}</Text>
            </View>

            <View style={componentStyles.resultItem}>
              <Text style={componentStyles.resultLabel}>Date</Text>
              <Text style={componentStyles.resultValue}>{result.date}</Text>
            </View>

            <View style={[componentStyles.resultItem, componentStyles.resultTotal]}>
              <Text style={componentStyles.resultLabel}>Total (₪)</Text>
              <TextInput
                style={componentStyles.resultTotalInput}
                value={editedTotal}
                onChangeText={setEditedTotal}
                keyboardType="numeric"
                editable={!confirming && !discarding}
              />
            </View>

            {/* Buttons */}
            <View style={componentStyles.resultButtons}>
              <TouchableOpacity
                style={componentStyles.cancelButton}
                onPress={handleCancel}
                disabled={confirming || discarding}
              >
                {discarding ? (
                  <ActivityIndicator color={COLORS.textPrimary} />
                ) : (
                  <Text style={componentStyles.cancelButtonText}>Cancel</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={componentStyles.confirmButton}
                onPress={handleConfirm}
                disabled={confirming || discarding}
              >
                {confirming ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={componentStyles.confirmButtonText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const componentStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  cameraViewfinder: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  cornerGuide: {
    width: 30,
    height: 30,
    position: 'absolute',
  },
  scanLine: {
    position: 'absolute',
    width: screenWidth - 40,
    height: 2,
    backgroundColor: '#22c55e',
    left: 20,
    shadowColor: '#22c55e',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
  instructionOverlay: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
  },
  instructionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a1a',
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureButtonInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffffff',
  },
  resultCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    maxHeight: 300,
  },
  resultContent: {
    gap: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resultTotal: {
    borderBottomWidth: 0,
    paddingVertical: 12,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 4,
  },
  resultLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  resultValue: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  resultInput: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
    padding: 0,
  },
  resultTotalValue: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: '700',
  },
  resultTotalInput: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
    padding: 0,
  },
  resultButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
