import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function Onboarding() {
    const [slide, setSlide] = useState(0);
    const router = useRouter();
    const { t } = useTranslation();
    const { fonts } = useTheme();

    const slides = [
        {
            titleKey: 'onboarding.slide1Title',
            descKey: 'onboarding.slide1Desc',
            renderVisual: () => (
                <View className="flex-row flex-wrap justify-center w-64 h-64 mx-auto my-10 relative">
                    {Array.from({ length: 16 }).map((_, i) => (
                        <View key={`red-${i}`} className="w-8 h-8 m-1 rounded-full bg-red-500 animate-pulse opacity-50" />
                    ))}
                </View>
            ),
        },
        {
            titleKey: 'onboarding.slide2Title',
            descKey: 'onboarding.slide2Desc',
            renderVisual: () => (
                <View className="flex-row flex-wrap justify-center w-64 h-64 mx-auto my-10 relative">
                    {Array.from({ length: 16 }).map((_, i) => (
                        <View key={`gray-${i}`} className="w-8 h-8 m-1 rounded-full bg-gray-500 opacity-30" />
                    ))}
                </View>
            ),
        },
        {
            titleKey: 'onboarding.slide3Title',
            descKey: 'onboarding.slide3Desc',
            renderVisual: () => (
                <View className="flex-row flex-wrap justify-center w-64 h-64 mx-auto my-10 relative">
                    {Array.from({ length: 16 }).map((_, i) => (
                        <View key={`green-${i}`} className="w-8 h-8 m-1 rounded-full bg-green-500 animate-bounce" />
                    ))}
                </View>
            ),
        }
    ];

    const handleNext = () => {
        if (slide < slides.length - 1) {
            setSlide(slide + 1);
        } else {
            router.push('/(auth)/register');
        }
    };

    return (
        <View className="flex-1 bg-gray-950 justify-center p-6">
            <View className="flex-1 justify-center">
                {slides[slide].renderVisual()}
                <Text className="text-3xl font-bold text-white text-center mb-4" style={{ fontFamily: fonts.heading }}>{t(slides[slide].titleKey)}</Text>
                <Text className="text-lg text-gray-400 text-center" style={{ fontFamily: fonts.body }}>{t(slides[slide].descKey)}</Text>
            </View>

            <View className="flex-row justify-between mb-8 items-center">
                <View className="flex-row">
                    {slides.map((_, i) => (
                        <View
                            key={i}
                            className={`w-2 h-2 rounded-full mx-1 ${i === slide ? 'bg-white' : 'bg-gray-700'}`}
                        />
                    ))}
                </View>
                <TouchableOpacity
                    className="bg-white px-6 py-3 rounded-full"
                    onPress={handleNext}
                >
                    <Text className="font-bold text-gray-950" style={{ fontFamily: fonts.bodySemiBold }}>{slide === slides.length - 1 ? t('onboarding.start') : t('onboarding.next')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
