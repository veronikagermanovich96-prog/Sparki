import React from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface BaseBottomSheetProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Maximum height of the sheet (e.g. '90%'). Default: none */
    maxHeight?: string | number;
    /** Wrap children in a ScrollView. Default: true */
    scrollable?: boolean;
    /** Modal animation type. Default: 'slide' */
    animationType?: 'slide' | 'fade';
    /** Extra styles for the inner container */
    style?: StyleProp<ViewStyle>;
}

export function BaseBottomSheet({
    visible,
    onClose,
    children,
    maxHeight,
    scrollable = true,
    animationType = 'slide',
    style,
}: BaseBottomSheetProps) {
    const { colors } = useTheme();

    function handleBackdropPress() {
        Keyboard.dismiss();
        onClose();
    }

    return (
        <Modal visible={visible} transparent animationType={animationType} onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1, justifyContent: 'flex-end' }}
            >
                <Pressable
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
                    onPress={handleBackdropPress}
                />
                <View
                    style={[
                        {
                            backgroundColor: colors.bgSecondary,
                            borderTopLeftRadius: 24,
                            borderTopRightRadius: 24,
                            paddingHorizontal: 24,
                            paddingTop: 20,
                            paddingBottom: 40,
                        },
                        maxHeight != null ? { maxHeight: maxHeight as any } : undefined,
                        style,
                    ]}
                >
                    {scrollable ? (
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            bounces={false}
                        >
                            {children}
                        </ScrollView>
                    ) : (
                        children
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
