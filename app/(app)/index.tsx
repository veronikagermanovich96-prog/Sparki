import { DailyDots } from '@/components/icon-array/DailyDots';
import { SavingsDots } from '@/components/icon-array/SavingsDots';
import { CreditCard, PiggyBank, Plus, Wallet } from 'lucide-react-native';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

export default function Dashboard() {
    return (
        <View className="flex-1 bg-gray-950 pt-16">
            <ScrollView className="px-6" showsVerticalScrollIndicator={false}>
                {/* Balance Section */}
                <View className="mt-4 mb-8">
                    <Text className="text-gray-400 text-lg mb-1">Активный баланс</Text>
                    <Text className="text-white text-5xl font-bold mb-2">€ 8,450.00</Text>
                    <Text className="text-gray-500">Всего на счетах: € 12,000</Text>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-6 -mx-6 px-6">
                        <View className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mr-4 w-40">
                            <CreditCard color="#a855f7" size={24} />
                            <Text className="text-white font-bold mt-4 mb-1">Основная</Text>
                            <Text className="text-gray-400">€ 5,200</Text>
                        </View>
                        <View className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mr-4 w-40">
                            <Wallet color="#3b82f6" size={24} />
                            <Text className="text-white font-bold mt-4 mb-1">Наличные</Text>
                            <Text className="text-gray-400">€ 350</Text>
                        </View>
                        <View className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mr-4 w-40">
                            <PiggyBank color="#22c55e" size={24} />
                            <Text className="text-gray-500 font-bold mt-4 mb-1">Заначка (скрыт)</Text>
                            <Text className="text-gray-600">€ 2,900</Text>
                        </View>
                    </ScrollView>
                </View>

                {/* Daily Icon Array */}
                <View className="bg-gray-900 border border-gray-800 rounded-3xl p-6 mb-8 items-center">
                    <Text className="text-white font-bold text-xl mb-4 w-full">Расходы месяца</Text>
                    <DailyDots period="month" dailyLimit={45} transactions={[]} />
                </View>

                {/* Savings Goals */}
                <View className="mb-24">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-white font-bold text-xl">Цели</Text>
                        <TouchableOpacity>
                            <Text className="text-blue-500 font-bold">Добавить</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6 px-6">
                        <View className="bg-gray-900 border border-gray-800 rounded-3xl p-5 mr-4 w-48">
                            <Text className="text-white font-bold mb-4">Машина 🚗</Text>
                            <SavingsDots currentBalance={2400} interestEarned={150} targetAmount={10000} />
                        </View>
                        <View className="bg-gray-900 border border-gray-800 rounded-3xl p-5 mr-4 w-48">
                            <Text className="text-white font-bold mb-4">Отпуск 🌴</Text>
                            <SavingsDots currentBalance={800} interestEarned={0} targetAmount={3000} />
                        </View>
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
