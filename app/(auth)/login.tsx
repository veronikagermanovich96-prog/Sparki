import { supabase } from '@/lib/supabase';
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
            <Text className="text-3xl font-bold text-white mb-8 text-center">{t('auth.welcomeBack')}</Text>

            <View className="gap-y-4 mb-8">
                <TextInput
                    className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white text-lg"
                    placeholder="Email"
                    placeholderTextColor="#6b7280"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextInput
                    className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white text-lg"
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
                <Text className="font-bold text-gray-950 text-lg">{t('auth.login')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
                className="mt-6 items-center"
                onPress={() => router.push('/(auth)/register')}
            >
                <Text className="text-gray-400">{t('auth.noAccount')}<Text className="text-white font-bold">{t('auth.register')}</Text></Text>
            </TouchableOpacity>
        </View>
    );
}
