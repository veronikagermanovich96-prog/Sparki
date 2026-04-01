import { CURRENCIES, CurrencyInfo } from '@/constants/currencies';
import { useTheme } from '@/context/ThemeContext';
import { Check, ChevronRight, Search, X } from 'lucide-react-native';
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    FlatList,
    Modal,
    Pressable,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface CurrencyPickerProps {
    value: string;
    onSelect: (code: string) => void;
    // Optional: render a custom trigger; otherwise renders a default row
    renderTrigger?: (selected: CurrencyInfo | undefined, onOpen: () => void) => React.ReactNode;
}

export function CurrencyPicker({ value, onSelect, renderTrigger }: CurrencyPickerProps) {
    const { colors, fonts } = useTheme();
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const searchRef = useRef<TextInput>(null);

    const selected = CURRENCIES.find(c => c.code === value);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return CURRENCIES;
        return CURRENCIES.filter(
            c =>
                c.code.toLowerCase().includes(q) ||
                c.name.toLowerCase().includes(q) ||
                c.symbol.toLowerCase().includes(q),
        );
    }, [query]);

    function handleOpen() {
        setQuery('');
        setOpen(true);
        // Focus search after modal animates in
        setTimeout(() => searchRef.current?.focus(), 300);
    }

    function handleSelect(code: string) {
        onSelect(code);
        setOpen(false);
    }

    const trigger = renderTrigger
        ? renderTrigger(selected, handleOpen)
        : (
            <TouchableOpacity
                onPress={handleOpen}
                activeOpacity={0.7}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.bgTertiary,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    marginBottom: 20,
                }}
            >
                <Text style={{ fontSize: 20, marginRight: 10 }}>{selected?.flag ?? '🌐'}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>
                        {selected?.code ?? value}
                    </Text>
                    {selected && (
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1, fontFamily: fonts.body }}>
                            {selected.name}
                        </Text>
                    )}
                </View>
                <ChevronRight color={colors.textMuted} size={18} />
            </TouchableOpacity>
        );

    return (
        <>
            {trigger}

            <Modal
                visible={open}
                transparent
                animationType="slide"
                onRequestClose={() => setOpen(false)}
            >
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
                    onPress={() => setOpen(false)}
                />

                <View style={{
                    backgroundColor: colors.bgSecondary,
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    paddingTop: 16,
                    paddingBottom: 40,
                    maxHeight: '80%',
                }}>
                    {/* Handle */}
                    <View style={{
                        width: 40, height: 4, backgroundColor: colors.borderLight,
                        borderRadius: 2, alignSelf: 'center', marginBottom: 16,
                    }} />

                    {/* Header */}
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 20,
                        marginBottom: 16,
                    }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700', flex: 1, fontFamily: fonts.heading }}>
                            {t('currencyPicker.title')}
                        </Text>
                        <TouchableOpacity onPress={() => setOpen(false)}>
                            <X color={colors.textMuted} size={22} />
                        </TouchableOpacity>
                    </View>

                    {/* Search */}
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: colors.bgTertiary,
                        borderRadius: 12,
                        marginHorizontal: 20,
                        marginBottom: 8,
                        paddingHorizontal: 12,
                    }}>
                        <Search color={colors.textMuted} size={18} />
                        <TextInput
                            ref={searchRef}
                            placeholder={t('currencyPicker.searchPlaceholder')}
                            placeholderTextColor={colors.textDisabled}
                            value={query}
                            onChangeText={setQuery}
                            style={{
                                flex: 1,
                                color: colors.textPrimary,
                                fontSize: 16,
                                paddingVertical: 12,
                                paddingHorizontal: 10,
                                fontFamily: fonts.body,
                            }}
                            autoCapitalize="characters"
                            returnKeyType="search"
                        />
                        {query.length > 0 && (
                            <TouchableOpacity onPress={() => setQuery('')}>
                                <X color={colors.textMuted} size={16} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Count */}
                    <Text style={{
                        color: colors.textDisabled,
                        fontSize: 12,
                        marginHorizontal: 20,
                        marginBottom: 8,
                        fontFamily: fonts.body,
                    }}>
                        {t('currencyPicker.count', { count: filtered.length })}
                    </Text>

                    {/* List */}
                    <FlatList
                        data={filtered}
                        keyExtractor={item => item.code}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                            <CurrencyRow
                                item={item}
                                selected={item.code === value}
                                onPress={() => handleSelect(item.code)}
                            />
                        )}
                        ListEmptyComponent={
                            <Text style={{
                                color: colors.textDisabled,
                                textAlign: 'center',
                                marginTop: 32,
                                fontSize: 15,
                                fontFamily: fonts.body,
                            }}>
                                {t('currencyPicker.noResults')}
                            </Text>
                        }
                    />
                </View>
            </Modal>
        </>
    );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function CurrencyRow({
    item,
    selected,
    onPress,
}: {
    item: CurrencyInfo;
    selected: boolean;
    onPress: () => void;
}) {
    const { colors, fonts } = useTheme();
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.6}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 13,
                paddingHorizontal: 20,
                backgroundColor: selected ? '#1e3a5f' : 'transparent',
            }}
        >
            <Text style={{ fontSize: 22, marginRight: 14, width: 32, textAlign: 'center' }}>
                {item.flag}
            </Text>
            <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: selected ? '700' : '500', fontFamily: fonts.bodySemiBold }}>
                    {item.code}
                    <Text style={{ color: colors.textMuted, fontWeight: '400', fontFamily: fonts.body }}>  {item.name}</Text>
                </Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 15, marginRight: 10, fontFamily: fonts.body }}>
                {item.symbol}
            </Text>
            {selected && <Check color="#3b82f6" size={18} />}
        </TouchableOpacity>
    );
}
