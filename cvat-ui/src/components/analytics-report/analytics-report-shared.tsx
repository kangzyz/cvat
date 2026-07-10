// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useTranslation } from 'react-i18next';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Empty from 'antd/lib/empty';
import Spin from 'antd/lib/spin';
import Text from 'antd/lib/typography/Text';

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
    if (value === null || typeof value === 'undefined') return '—';
    const fractionDigits = Number.isInteger(maximumFractionDigits) &&
        maximumFractionDigits >= 0 && maximumFractionDigits <= 20 ? maximumFractionDigits : 0;
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: fractionDigits }).format(value);
}

export function formatPercent(
    value: number | null | undefined,
    scale: 'percent' | 'ratio' = 'percent',
): string {
    if (value === null || typeof value === 'undefined') return '—';
    const normalized = scale === 'ratio' ? value * 100 : value;
    return `${formatNumber(normalized, 1)}%`;
}

export function formatDuration(milliseconds: number): string {
    if (milliseconds > 0 && milliseconds < 60000) {
        return `${Math.max(Math.round(milliseconds / 1000), 1)}s`;
    }
    const totalMinutes = Math.round(milliseconds / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

export function formatSeconds(seconds: number): string {
    return formatDuration(seconds * 1000);
}

export function formatDate(value: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

export interface MetricItem {
    label: React.ReactNode;
    value: React.ReactNode;
    note?: React.ReactNode;
}

export function MetricStrip({ items }: { items: MetricItem[] }): JSX.Element {
    return (
        <div className='cvat-analytics-metric-strip'>
            {items.map((item, index) => (
                <div className='cvat-analytics-metric' key={`${String(item.label)}-${index}`}>
                    <Text className='cvat-analytics-metric-label'>{item.label}</Text>
                    <div className='cvat-analytics-metric-value'>{item.value}</div>
                    {item.note ? <Text type='secondary'>{item.note}</Text> : null}
                </div>
            ))}
        </div>
    );
}

interface SectionStateProps {
    fetching: boolean;
    error: string | null;
    empty: boolean;
    onRetry(): void;
    children: React.ReactNode;
    emptyDescription: React.ReactNode;
}

export function SectionState(props: SectionStateProps): JSX.Element {
    const {
        fetching, error, empty, onRetry, children, emptyDescription,
    } = props;
    const { t } = useTranslation('resources');

    if (fetching && empty) {
        return <div className='cvat-analytics-section-state'><Spin /></div>;
    }
    if (error && empty) {
        return (
            <Alert
                type='error'
                showIcon
                message={error}
                action={<Button size='small' onClick={onRetry}>{t('analytics.actions.retry')}</Button>}
            />
        );
    }
    if (empty) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />;
    }

    return (
        <Spin spinning={fetching}>
            {error ? <Alert type='warning' showIcon message={error} className='cvat-analytics-inline-alert' /> : null}
            {children}
        </Spin>
    );
}
