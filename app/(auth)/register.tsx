import { seedDefaultCategories } from '@/lib/seedCategories';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function Register() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { t } = useTranslation();
    const { colors, fonts, isDark } = useTheme();

    async function signUpWithEmail() {
        setLoading(true);
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            Alert.alert(t('common.error'), error.message);
            setLoading(false);
            return;
        }

        if (data.user) {
            const { data: household, error: householdError } = await supabase
                .from('households')
                .insert({ name: t('auth.defaultHousehold'), base_currency: 'EUR' })
                .select()
                .single();

            if (householdError) {
                Alert.alert(t('common.error'), householdError.message);
                setLoading(false);
                return;
            }

            await supabase.from('household_members').insert({
                household_id: household.id,
                user_id: data.user.id,
                role: 'owner',
            });

            await seedDefaultCategories(household.id);
        }

        // Auto-login if signUp didn't create a session (email confirmation enabled)
        if (!data.session) {
            await supabase.auth.signInWithPassword({ email, password });
        }

        setLoading(false);
        router.replace('/(app)' as any);
    }

    return (
        <View className="flex-1 justify-center px-8" style={{ backgroundColor: colors.bgPrimary }}>
            <Text className="text-3xl font-bold mb-8 text-center" style={{ fontFamily: fonts.heading, color: colors.textPrimary }}>{t('auth.createAccount')}</Text>

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
                onPress={signUpWithEmail}
                disabled={loading}
            >
                <Text className="font-bold text-lg" style={{ fontFamily: fonts.bodySemiBold, color: isDark ? '#030712' : '#ffffff' }}>{t('auth.register')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
                className="mt-6 items-center"
                onPress={() => router.push('/(auth)/login')}
            >
                <Text style={{ fontFamily: fonts.body, color: colors.textSecondary }}>{t('auth.hasAccount')}<Text className="font-bold" style={{ fontFamily: fonts.bodyBold, color: colors.textPrimary }}>{t('auth.login')}</Text></Text>
            </TouchableOpacity>
        </View>
    );
}
