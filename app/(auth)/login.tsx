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
    const { fonts } = useTheme();

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
        <View className="flex-1 bg-gray-950 px-8 justify-center">
            <Text className="text-3xl font-bold text-white mb-8 text-center" style={{ fontFamily: fonts.heading }}>{t('auth.welcomeBack')}</Text>

            <View className="gap-y-4 mb-8">
                <TextInput
                    className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white text-lg"
                    style={{ fontFamily: fonts.body }}
                    placeholder="Email"
                    placeholderTextColor="#6b7280"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextInput
                    className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white text-lg"
                    style={{ fontFamily: fonts.body }}
                    placeholder={t('auth.password')}
                    placeholderTextColor="#6b7280"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />
            </View>

            <TouchableOpacity
                className={`bg-white rounded-2xl p-4 items-center ${loading ? 'opacity-50' : ''}`}
                onPress={signInWithEmail}
                disabled={loading}
            >
                <Text className="font-bold text-gray-950 text-lg" style={{ fontFamily: fonts.bodySemiBold }}>{t('auth.login')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
                className="mt-6 items-center"
                onPress={() => router.push('/(auth)/register')}
            >
                <Text className="text-gray-400" style={{ fontFamily: fonts.body }}>{t('auth.noAccount')}<Text className="text-white font-bold" style={{ fontFamily: fonts.bodyBold }}>{t('auth.register')}</Text></Text>
            </TouchableOpacity>
        </View>
    );
}
