// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useTranslation } from 'react-i18next';
import Text from 'antd/lib/typography/Text';

import { QualityReport } from 'cvat-core-wrapper';
import { formatPercent } from '../quality-control-utils';

interface Props {
    report: QualityReport | null;
}

export default function QualityMetrics({ report }: Readonly<Props>): JSX.Element {
    const { t } = useTranslation('qualityReviewModels');
    const metrics = [
        ['accuracy', report?.summary.accuracy],
        ['precision', report?.summary.precision],
        ['recall', report?.summary.recall],
    ] as const;

    return (
        <section className='cvat-quality-section cvat-quality-metrics'>
            <div className='cvat-quality-section-heading'>
                <div>
                    <Text strong>{t('quality.overview.metrics.title')}</Text>
                    <Text type='secondary'>{t('quality.overview.metrics.description')}</Text>
                </div>
            </div>
            <div className='cvat-quality-metric-strip'>
                {metrics.map(([metric, value]) => (
                    <div key={metric} className='cvat-quality-metric-item'>
                        <Text type='secondary'>{t(`quality.metrics.${metric}`)}</Text>
                        <strong>{formatPercent(value)}</strong>
                        <Text type='secondary'>{t(`quality.overview.metrics.help.${metric}`)}</Text>
                    </div>
                ))}
            </div>
        </section>
    );
}
