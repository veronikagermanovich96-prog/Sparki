import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { t } = useTranslation();
    const { colors, fonts, isDark } = useTheme();

    async function signInWithEmail() {
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            Alert.alert(t('common.error'), error.message);
        } else {
            router.replace('/(app)');
        }
        setLoading(false);
    }

    return (
        <View className="flex-1 px-8 justify-center" style={{ backgroundColor: colors.bgPrimary }}>
            <Text className="text-3xl font-bold mb-8 text-center" style={{ fontFamily: fonts.heading, color: colors.textPrimary }}>{t('auth.welcomeBack')}</Text>

            <View className="gap-y-4 mb-8">
                <TextInput
                    className="rounded-2xl p-4 text-lg"
                    style={{ fontFamily: fonts.body, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary }}
                    placeholder="Email"
                    placeholderTextColor={colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextInput
                    className="rounded-2xl p-4 text-lg"
                    style={{ fontFamily: fonts.body, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary }}
                    placeholder={t('auth.password')}
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />
            </View>

            <TouchableOpacity
                className={`rounded-2xl p-4 items-center ${loading ? 'opacity-50' : ''}`}
                style={{ backgroundColor: isDark ? '#ffffff' : colors.brand }}
                onPress={signInWithEmail}
                disabled={loading}
            >
                <Text className="font-bold text-lg" style={{ fontFamily: fonts.bodySemiBold, color: isDark ? '#030712' : '#ffffff' }}>{t('auth.login')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
                className="mt-6 items-center"
                onPress={() => router.push('/(auth)/register')}
            >
                <Text style={{ fontFamily: fonts.body, color: colors.textSecondary }}>{t('auth.noAccount')}<Text className="font-bold" style={{ fontFamily: fonts.bodyBold, color: colors.textPrimary }}>{t('auth.register')}</Text></Text>
            </TouchableOpacity>
        </View>
    );
}
