import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function Register() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    async function signUpWithEmail() {
        setLoading(true);
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            Alert.alert('Ошибка', error.message);
            setLoading(false);
            return;
        }

        if (data.user) {
            const { data: household, error: householdError } = await supabase
                .from('households')
                .insert({ name: 'Мой бюджет', base_currency: 'EUR' })
                .select()
                .single();

            if (householdError) {
                Alert.alert('Ошибка', householdError.message);
                setLoading(false);
                return;
            }

            await supabase.from('household_members').insert({
                household_id: household.id,
                user_id: data.user.id,
                role: 'owner',
            });
        }

        setLoading(false);
        router.replace('/(app)');
    }

    return (
        <View className="flex-1 bg-gray-950 justify-center px-8">
            <Text className="text-3xl font-bold text-white mb-8 text-center">Создать аккаунт</Text>

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
                    placeholder="Пароль"
                    placeholderTextColor="#6b7280"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />
            </View>

            <TouchableOpacity
                className={`bg-white rounded-2xl p-4 items-center ${loading ? 'opacity-50' : ''}`}
                onPress={signUpWithEmail}
                disabled={loading}
            >
                <Text className="font-bold text-gray-950 text-lg">Зарегистрироваться</Text>
            </TouchableOpacity>

            <TouchableOpacity
                className="mt-6 items-center"
                onPress={() => router.push('/(auth)/login')}
            >
                <Text className="text-gray-400">Уже есть аккаунт? <Text className="text-white font-bold">Войти</Text></Text>
            </TouchableOpacity>
        </View>
    );
}
