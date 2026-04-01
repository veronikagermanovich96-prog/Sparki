/**
 * VoiceInput – web fallback (speech recognition not available on web)
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Mic, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/context/ThemeContext';
import { BaseBottomSheet } from '@/components/ui/BaseBottomSheet';
import type { Account, Category } from '@/types';

interface VoiceInputProps {
    visible: boolean;
    onClose: () => void;
    onSaved: () => void;
    householdId: string;
    accounts: Account[];
    categories: Category[];
    baseCurrency: string;
}

export default function VoiceInput({
    visible, onClose,
}: VoiceInputProps) {
    const { colors, fonts } = useTheme();
    const { t } = useTranslation();

    if (!visible) return null;

    return (
        <BaseBottomSheet visible={visible} onClose={onClose}>
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Mic color={colors.textSecondary} size={48} />
                <Text
                    style={{
                        fontFamily: fonts.bodyMedium,
                        fontSize: 16,
                        color: colors.textSecondary,
                        marginTop: 16,
                        textAlign: 'center',
                    }}
                >
                    {t('voiceInput.notAvailableWeb', 'Voice input is not available on web')}
                </Text>
                <TouchableOpacity
                    onPress={onClose}
                    style={{
                        marginTop: 24,
                        paddingHorizontal: 24,
                        paddingVertical: 12,
                        backgroundColor: colors.bgCard,
                        borderRadius: 12,
                    }}
                >
                    <Text style={{ fontFamily: fonts.bodyMedium, color: colors.textPrimary }}>
                        {t('common.close', 'Close')}
                    </Text>
                </TouchableOpacity>
            </View>
        </BaseBottomSheet>
    );
}
