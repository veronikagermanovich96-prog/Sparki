import {
    Banknote, Bitcoin, Briefcase, Building2, Car,
    CircleDollarSign, Coins, CreditCard,
    Globe, Home, Landmark, PiggyBank, Plus,
    Smartphone, TrendingUp, Wallet,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { formatAmount } from '@/constants/currencies';
import { Account } from '@/types';

const ICON_MAP: Record<string, React.ComponentType<{ color: string; size: number }>> = {
    CreditCard, Wallet, Building2, Banknote, Coins,
    PiggyBank, TrendingUp, Landmark, CircleDollarSign,
    Briefcase, Home, Car, Smartphone, Globe, Bitcoin,
};

export default function Dashboard() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [currency, setCurrency] = useState('EUR');

    useFocusEffect(useCallback(() => {
        loadData();
    }, []));

    async function loadData() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data: member } = await supabase
            .from('household_members')
            .select('household_id, households(base_currency)')
            .eq('user_id', user.id)
            .single();

        if (member) {
            const hh = member.households as unknown as { base_currency: string } | null;
            if (hh?.base_currency) setCurrency(hh.base_currency);

            const { data } = await supabase
                .from('accounts')
                .select('*')
                .eq('household_id', member.household_id)
                .eq('is_deleted', false)
                .order('sort_order', { ascending: true, nullsFirst: true })
                .order('created_at', { ascending: true });

            setAccounts(data ?? []);
        }
        setLoading(false);
    }

    const activeBalance = accounts
        .filter(a => !a.exclude_from_dashboard)
        .reduce((s, a) => s + a.balance, 0);

    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

    return (
        <View className="flex-1 bg-gray-950 pt-16">
            <ScrollView className="px-6" showsVerticalScrollIndicator={false}>

                {/* Balance Section */}
                <View className="mt-4 mb-8">
                    <Text className="text-gray-400 text-sm mb-1">Активный баланс</Text>

                    {loading ? (
                        <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start', marginVertical: 10 }} />
                    ) : (
                        <>
                            <Text className="text-white text-5xl font-bold mb-1">
                                {formatAmount(activeBalance, currency)}
                            </Text>
                            <Text className="text-gray-500 text-sm">
                                Всего на счетах: {formatAmount(totalBalance, currency)}
                            </Text>
                        </>
                    )}

                    {/* Account cards */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="mt-6 -mx-6 px-6"
                    >
                        {accounts.map(account => {
                            const IC = ICON_MAP[account.icon ?? 'CreditCard'] ?? CreditCard;
                            const color = account.color ?? '#3b82f6';
                            return (
                                <View
                                    key={account.id}
                                    className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mr-4 w-40"
                                >
                                    <IC color={color} size={24} />
                                    <Text
                                        className="text-white font-bold mt-4 mb-1"
                                        numberOfLines={1}
                                    >
                                        {account.name}
                                    </Text>
                                    <Text className="text-gray-400">
                                        {formatAmount(account.balance, account.currency)}
                                    </Text>
                                    {account.exclude_from_dashboard && (
                                        <Text className="text-gray-600 text-xs mt-1">(скрыт)</Text>
                                    )}
                                </View>
                            );
                        })}

                        {accounts.length === 0 && !loading && (
                            <View className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mr-4 w-40 justify-center items-center h-28">
                                <Text className="text-gray-500 text-center text-sm">Нет счетов</Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                className="absolute bottom-6 right-6 bg-blue-600 w-16 h-16 rounded-full items-center justify-center shadow-lg shadow-blue-500/50"
                activeOpacity={0.8}
            >
                <Plus color="#ffffff" size={32} />
            </TouchableOpacity>
        </View>
    );
}
