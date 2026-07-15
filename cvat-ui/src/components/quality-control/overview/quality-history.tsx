// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useTranslation } from 'react-i18next';
import Collapse from 'antd/lib/collapse';
import Table, { TableProps } from 'antd/lib/table';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import dayjs from 'dayjs';

import { QualityReport, QualitySettings } from 'cvat-core-wrapper';
import {
    formatPercent,
    getMetricScore,
    getReportRule,
    getVerdict,
    metricTranslationKey,
} from '../quality-control-utils';

interface Props {
    history: QualityReport[];
    selectedID: number | null;
    settings: QualitySettings | null;
    onSelect: (reportID: number) => void;
}

interface HistoryRow {
    key: number;
    report: QualityReport;
    metric: string;
    score: number | null;
    threshold: number | null;
    verdict: string;
    coverage: string;
    delta: string;
    legacy: boolean;
}

export default function QualityHistory(props: Readonly<Props>): JSX.Element {
    const {
        history, selectedID, settings, onSelect,
    } = props;
    const { t } = useTranslation('qualityReviewModels');
    const rows = history.map<HistoryRow>((report, index) => {
        const rule = getReportRule(report, settings);
        const score = getMetricScore(report, rule.metric);
        const previous = history[index + 1];
        let delta = '—';
        if (previous) {
            const previousRule = getReportRule(previous, settings);
            const previousScore = getMetricScore(previous, previousRule.metric);
            if (rule.metric !== previousRule.metric) {
                delta = t('quality.overview.history.ruleChanged');
            } else if (score !== null && previousScore !== null) {
                const value = (score - previousScore) * 100;
                delta = t('quality.overview.history.deltaValue', {
                    value: `${value > 0 ? '+' : ''}${value.toFixed(1)}`,
                });
            }
        }
        return {
            key: report.id,
            report,
            metric: t(metricTranslationKey(rule.metric)),
            score,
            threshold: rule.threshold,
            verdict: getVerdict(report, rule),
            coverage: report.summary.tasks ? t('quality.overview.history.projectCoverage', {
                included: report.summary.tasks.included,
                total: report.summary.tasks.total,
            }) : `${report.summary.validationFrames}/${report.summary.totalFrames}`,
            delta,
            legacy: rule.legacy,
        };
    });
    const verdictColor = (verdict: string): 'success' | 'error' | 'warning' => {
        if (verdict === 'met') return 'success';
        if (verdict === 'missed') return 'error';
        return 'warning';
    };
    const columns: TableProps<HistoryRow>['columns'] = [
        {
            title: t('quality.overview.history.time'),
            width: 155,
            render: (_value, row) => dayjs(row.report.createdDate).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: t('quality.overview.history.target'),
            width: 170,
            render: (_value, row) => `${row.metric} ${formatPercent(row.score)} / ${formatPercent(row.threshold)}`,
        },
        {
            title: t('quality.overview.history.result'),
            width: 110,
            render: (_value, row) => (
                <Tag color={verdictColor(row.verdict)}>
                    {t(`quality.overview.verdict.${row.verdict}`)}
                </Tag>
            ),
        },
        { title: t('quality.overview.history.coverage'), dataIndex: 'coverage', width: 110 },
        { title: t('quality.overview.history.delta'), dataIndex: 'delta', width: 100 },
        {
            title: t('quality.overview.history.note'),
            render: (_value, row) => (row.legacy ? t('quality.overview.history.legacy') : '—'),
        },
    ];

    return (
        <section className='cvat-quality-section cvat-quality-history'>
            <Collapse
                ghost
                items={[{
                    key: 'history',
                    label: (
                        <span>
                            <Text strong>{t('quality.overview.history.title')}</Text>
                            <Text type='secondary'> · {history.length}</Text>
                        </span>
                    ),
                    children: (
                        <Table
                            size='small'
                            columns={columns}
                            dataSource={rows}
                            pagination={false}
                            rowClassName={(row) => (row.report.id === selectedID ? 'cvat-quality-history-selected' : '')}
                            onRow={(row) => ({
                                onClick: () => onSelect(row.report.id),
                                tabIndex: 0,
                                onKeyDown: (event) => {
                                    if (event.key === 'Enter' || event.key === ' ') onSelect(row.report.id);
                                },
                            })}
                            scroll={{ x: 820 }}
                        />
                    ),
                }]}
            />
        </section>
    );
}
