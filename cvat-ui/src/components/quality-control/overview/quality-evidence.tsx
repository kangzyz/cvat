// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExclamationCircleFilled, WarningFilled } from '@ant-design/icons';
import Button from 'antd/lib/button';
import Text from 'antd/lib/typography/Text';

import { QualityReport } from 'cvat-core-wrapper';

interface Props {
    report: QualityReport | null;
    onOpenEvidence: (severity?: 'error' | 'warning', conflictType?: string) => void;
}

const conflictTypes = [
    ['extraAnnotations', 'extra_annotation'],
    ['missingAnnotations', 'missing_annotation'],
    ['mismatchingLabel', 'mismatching_label'],
    ['lowOverlap', 'low_overlap'],
    ['mismatchingDirection', 'mismatching_direction'],
    ['mismatchingAttributes', 'mismatching_attributes'],
    ['mismatchingGroups', 'mismatching_groups'],
    ['coveredAnnotation', 'covered_annotation'],
] as const;

export default function QualityEvidence({ report, onOpenEvidence }: Readonly<Props>): JSX.Element {
    const { t } = useTranslation('qualityReviewModels');
    const summary = report?.summary;
    const conflicts = summary?.conflictsByType;

    return (
        <section className='cvat-quality-section cvat-quality-evidence'>
            <div className='cvat-quality-section-heading'>
                <div>
                    <Text strong>{t('quality.overview.evidence.title')}</Text>
                    <Text type='secondary'>{t('quality.overview.evidence.description')}</Text>
                </div>
            </div>
            <div className='cvat-quality-severity-row'>
                <Button type='text' onClick={() => onOpenEvidence('error')} disabled={!summary?.errorCount}>
                    <ExclamationCircleFilled className='cvat-quality-error-icon' />
                    <span>{t('quality.overview.evidence.errors', { count: summary?.errorCount || 0 })}</span>
                </Button>
                <Button type='text' onClick={() => onOpenEvidence('warning')} disabled={!summary?.warningCount}>
                    <WarningFilled className='cvat-quality-warning-icon' />
                    <span>{t('quality.overview.evidence.warnings', { count: summary?.warningCount || 0 })}</span>
                </Button>
            </div>
            <div className='cvat-quality-conflict-types'>
                {conflictTypes.map(([field, type]) => {
                    const count = conflicts?.[field] || 0;
                    return (
                        <Button
                            key={type}
                            type='default'
                            size='small'
                            disabled={!count}
                            onClick={() => onOpenEvidence(undefined, type)}
                        >
                            {t(`quality.overview.conflicts.${type}`)} <strong>{count}</strong>
                        </Button>
                    );
                })}
            </div>
        </section>
    );
}
