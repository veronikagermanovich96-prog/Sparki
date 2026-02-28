import { CURRENCIES, CurrencyInfo } from '@/constants/currencies';
import { Check, ChevronRight, Search, X } from 'lucide-react-native';
import React, { useMemo, useRef, useState } from 'react';
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
                    backgroundColor: '#1f2937',
                    borderWidth: 1,
                    borderColor: '#374151',
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    marginBottom: 20,
                }}
            >
                <Text style={{ fontSize: 20, marginRight: 10 }}>{selected?.flag ?? '🌐'}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                        {selected?.code ?? value}
                    </Text>
                    {selected && (
                        <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 1 }}>
                            {selected.name}
                        </Text>
                    )}
                </View>
                <ChevronRight color="#6b7280" size={18} />
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
                    backgroundColor: '#111827',
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    paddingTop: 16,
                    paddingBottom: 40,
                    maxHeight: '80%',
                }}>
                    {/* Handle */}
                    <View style={{
                        width: 40, height: 4, backgroundColor: '#374151',
                        borderRadius: 2, alignSelf: 'center', marginBottom: 16,
                    }} />

                    {/* Header */}
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 20,
                        marginBottom: 16,
                    }}>
                        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', flex: 1 }}>
                            Выбрать валюту
                        </Text>
                        <TouchableOpacity onPress={() => setOpen(false)}>
                            <X color="#6b7280" size={22} />
                        </TouchableOpacity>
                    </View>

                    {/* Search */}
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#1f2937',
                        borderRadius: 12,
                        marginHorizontal: 20,
                        marginBottom: 8,
                        paddingHorizontal: 12,
                    }}>
                        <Search color="#6b7280" size={18} />
                        <TextInput
                            ref={searchRef}
                            placeholder="Поиск: USD, Euro, £…"
                            placeholderTextColor="#4b5563"
                            value={query}
                            onChangeText={setQuery}
                            style={{
                                flex: 1,
                                color: '#fff',
                                fontSize: 16,
                                paddingVertical: 12,
                                paddingHorizontal: 10,
                            }}
                            autoCapitalize="characters"
                            returnKeyType="search"
                        />
                        {query.length > 0 && (
                            <TouchableOpacity onPress={() => setQuery('')}>
                                <X color="#6b7280" size={16} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Count */}
                    <Text style={{
                        color: '#4b5563',
                        fontSize: 12,
                        marginHorizontal: 20,
                        marginBottom: 8,
                    }}>
                        {filtered.length} {filtered.length === 1 ? 'валюта' : 'валют'}
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
                                color: '#4b5563',
                                textAlign: 'center',
                                marginTop: 32,
                                fontSize: 15,
                            }}>
                                Ничего не найдено
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
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: selected ? '700' : '500' }}>
                    {item.code}
                    <Text style={{ color: '#6b7280', fontWeight: '400' }}>  {item.name}</Text>
                </Text>
            </View>
            <Text style={{ color: '#6b7280', fontSize: 15, marginRight: 10 }}>
                {item.symbol}
            </Text>
            {selected && <Check color="#3b82f6" size={18} />}
        </TouchableOpacity>
    );
}
