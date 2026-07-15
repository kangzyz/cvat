// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    CheckCircleFilled,
    ClockCircleOutlined,
    ExclamationCircleFilled,
    ReloadOutlined,
    WarningFilled,
} from '@ant-design/icons';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Progress from 'antd/lib/progress';
import Space from 'antd/lib/space';
import Text from 'antd/lib/typography/Text';
import dayjs from 'dayjs';

import {
    QualityReport,
    QualitySettings,
    Request,
    RQStatus,
} from 'cvat-core-wrapper';
import {
    formatPercent,
    getMetricScore,
    getReportRule,
    getVerdict,
    metricTranslationKey,
} from '../quality-control-utils';

interface Props {
    report: QualityReport | null;
    latestReportID: number | null;
    settings: QualitySettings | null;
    staleReasons: string[];
    coverageFacts: string[];
    calculation: {
        request: Request | null;
        submitting: boolean;
        error: Error | null;
    };
    canCalculate: boolean;
    calculateDisabledReason?: string;
    onCalculate: () => void;
    onReturnLatest: () => void;
}

export default function QualityVerdict(props: Readonly<Props>): JSX.Element {
    const {
        report,
        latestReportID,
        settings,
        staleReasons,
        coverageFacts,
        calculation,
        canCalculate,
        calculateDisabledReason,
        onCalculate,
        onReturnLatest,
    } = props;
    const { t } = useTranslation('qualityReviewModels');
    const rule = getReportRule(report, settings);
    const score = getMetricScore(report, rule.metric);
    const verdict = getVerdict(report, rule);
    const historical = Boolean(report && latestReportID && report.id !== latestReportID);
    const running = calculation.submitting || [RQStatus.QUEUED, RQStatus.STARTED].includes(
        calculation.request?.status,
    );
    const progress = Math.round((calculation.request?.progress || 0) * 100);
    const gap = score !== null && rule.threshold !== null ? Math.abs(score - rule.threshold) : null;

    let verdictIcon = <WarningFilled />;
    if (verdict === 'met') {
        verdictIcon = <CheckCircleFilled />;
    } else if (verdict === 'missed') {
        verdictIcon = <ExclamationCircleFilled />;
    }
    const calculationMessage = calculation.submitting ?
        t('quality.overview.calculation.submitting') :
        calculation.request?.message || t(`quality.overview.calculation.${calculation.request?.status}`);

    return (
        <section className={`cvat-quality-verdict cvat-quality-verdict-${verdict}`}>
            {historical && (
                <Alert
                    className='cvat-quality-historical-alert'
                    type='info'
                    showIcon
                    message={t('quality.overview.history.selected')}
                    action={<Button size='small' onClick={onReturnLatest}>{t('quality.overview.history.returnLatest')}</Button>}
                />
            )}

            <div className='cvat-quality-verdict-main'>
                <div className='cvat-quality-verdict-copy'>
                    <div className='cvat-quality-verdict-title'>
                        {verdictIcon}
                        <span>{t(`quality.overview.verdict.${verdict}`)}</span>
                    </div>
                    <div className='cvat-quality-verdict-score'>
                        <Text strong>{t(metricTranslationKey(rule.metric))}</Text>
                        <span>{formatPercent(score)}</span>
                        {rule.threshold !== null && (
                            <Text type='secondary'>/ {formatPercent(rule.threshold)}</Text>
                        )}
                    </div>
                    {gap !== null && verdict !== 'insufficient' && (
                        <Text type='secondary'>
                            {t(`quality.overview.verdict.${verdict}Gap`, { gap: (gap * 100).toFixed(1) })}
                        </Text>
                    )}
                </div>

                <div className='cvat-quality-verdict-action'>
                    <Button
                        type='primary'
                        icon={<ReloadOutlined />}
                        loading={running}
                        disabled={!canCalculate || running || historical}
                        onClick={onCalculate}
                        title={calculateDisabledReason}
                    >
                        {report ? t('quality.overview.actions.recalculate') : t('quality.overview.actions.calculate')}
                    </Button>
                    {!canCalculate && calculateDisabledReason && (
                        <Text type='secondary'>{calculateDisabledReason}</Text>
                    )}
                </div>
            </div>

            {running && (
                <div className='cvat-quality-calculation-progress'>
                    <Progress percent={progress} showInfo={progress > 0} size='small' />
                    <Text type='secondary'>
                        {calculationMessage}
                    </Text>
                </div>
            )}

            {calculation.error && (
                <Alert
                    type='error'
                    showIcon
                    message={t('quality.overview.calculation.failed')}
                    description={calculation.error.message}
                    action={<Button size='small' onClick={onCalculate}>{t('quality.overview.actions.retry')}</Button>}
                />
            )}

            <div className='cvat-quality-verdict-trust'>
                <Space size='large' wrap>
                    <span>
                        <ClockCircleOutlined />
                        {' '}
                        {report ? t('quality.overview.trust.calculatedAt', {
                            time: dayjs(report.createdDate).format('YYYY-MM-DD HH:mm'),
                        }) : t('quality.overview.trust.noReport')}
                    </span>
                    {report && (
                        <span className={staleReasons.length ? 'cvat-quality-trust-warning' : ''}>
                            {staleReasons.length ? <WarningFilled /> : <CheckCircleFilled />}
                            {' '}
                            {staleReasons.length ? t('quality.overview.trust.stale', {
                                reasons: staleReasons.map((reason) => (
                                    t(`quality.overview.staleReasons.${reason}`)
                                )).join('、'),
                            }) : t('quality.overview.trust.fresh')}
                        </span>
                    )}
                    {coverageFacts.map((fact) => <span key={fact}>{fact}</span>)}
                </Space>
                {rule.legacy && report && (
                    <Text className='cvat-quality-legacy-rule' type='warning'>
                        {t('quality.overview.trust.legacyRule')}
                    </Text>
                )}
            </div>
        </section>
    );
}
