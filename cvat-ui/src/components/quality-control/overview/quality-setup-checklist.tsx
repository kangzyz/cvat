// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircleFilled, ClockCircleOutlined, StopOutlined } from '@ant-design/icons';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Progress from 'antd/lib/progress';
import Text from 'antd/lib/typography/Text';

import {
    DimensionType,
    Job,
    Request,
    RQStatus,
    Task,
    TaskValidationLayout,
} from 'cvat-core-wrapper';
import { isGroundTruthReady } from '../quality-control-utils';

interface Props {
    task: Task;
    gtJob: Job | null;
    validationLayout: TaskValidationLayout | null;
    reportExists: boolean;
    calculating: boolean;
    calculationRequest: Request | null;
    calculationError: Error | null;
    onCalculate: () => void;
}

export default function QualitySetupChecklist(props: Readonly<Props>): JSX.Element | null {
    const {
        task,
        gtJob,
        validationLayout,
        reportExists,
        calculating,
        calculationRequest,
        calculationError,
        onCalculate,
    } = props;
    const { t } = useTranslation('qualityReviewModels');
    const activeFrames = validationLayout ?
        validationLayout.validationFrames.length - validationLayout.disabledFrames.length : 0;
    const progress = Math.round((calculationRequest?.progress || 0) * 100);
    const calculationMessage = calculationRequest?.message || t(
        `quality.overview.calculation.${calculationRequest?.status || 'submitting'}`,
    );

    if (task.dimension !== DimensionType.DIMENSION_2D) {
        return (
            <Alert
                className='cvat-quality-setup-alert'
                type='warning'
                showIcon
                message={t('quality.overview.setup.unsupportedTitle')}
                description={t('quality.overview.setup.unsupportedDescription')}
            />
        );
    }

    if (reportExists && isGroundTruthReady(gtJob) && activeFrames > 0) return null;

    let groundTruthAction: JSX.Element | null = null;
    if (gtJob && !isGroundTruthReady(gtJob)) {
        groundTruthAction = (
            <Link to={`/tasks/${task.id}/jobs/${gtJob.id}`}>
                {t('quality.overview.setup.openGroundTruth')}
            </Link>
        );
    } else if (gtJob) {
        groundTruthAction = <a href='#management'>{t('quality.overview.setup.openValidation')}</a>;
    }

    const steps = [
        {
            done: Boolean(gtJob),
            active: !gtJob,
            title: t('quality.overview.setup.createGroundTruth'),
            description: t('quality.overview.setup.createGroundTruthHelp'),
            action: <Link to={`/tasks/${task.id}/jobs/create`}>{t('quality.overview.setup.createJob')}</Link>,
        },
        {
            done: isGroundTruthReady(gtJob) && activeFrames > 0,
            active: Boolean(gtJob) && (!isGroundTruthReady(gtJob) || activeFrames <= 0),
            title: t('quality.overview.setup.prepareGroundTruth'),
            description: !isGroundTruthReady(gtJob) ?
                t('quality.overview.setup.completeGroundTruthHelp') : t('quality.overview.setup.validationFramesHelp'),
            action: groundTruthAction,
        },
        {
            done: reportExists,
            active: isGroundTruthReady(gtJob) && activeFrames > 0 && !reportExists,
            title: t('quality.overview.setup.calculateReport'),
            description: t('quality.overview.setup.calculateReportHelp'),
            action: (
                <Button
                    type='link'
                    loading={calculating}
                    disabled={!isGroundTruthReady(gtJob) || activeFrames <= 0}
                    onClick={onCalculate}
                >
                    {t('quality.overview.actions.calculate')}
                </Button>
            ),
        },
    ];
    const stepClassName = (step: { done: boolean; active: boolean }): string => {
        if (step.done) return 'done';
        if (step.active) return 'active';
        return 'pending';
    };
    const stepIcon = (step: { done: boolean; active: boolean }): JSX.Element => {
        if (step.done) return <CheckCircleFilled />;
        if (step.active) return <ClockCircleOutlined />;
        return <StopOutlined />;
    };

    return (
        <section className='cvat-quality-setup'>
            <Text strong>{t('quality.overview.setup.title')}</Text>
            <Text type='secondary'>{t('quality.overview.setup.description')}</Text>
            <ol>
                {steps.map((step, index) => (
                    <li
                        key={step.title}
                        className={stepClassName(step)}
                    >
                        <span className='cvat-quality-setup-icon'>
                            {stepIcon(step)}
                        </span>
                        <div>
                            <Text strong>{t('quality.overview.setup.step', { number: index + 1 })}: {step.title}</Text>
                            <Text type='secondary'>{step.description}</Text>
                            {step.action}
                        </div>
                    </li>
                ))}
            </ol>
            {calculating && (
                <div className='cvat-quality-calculation-progress'>
                    <Progress percent={progress} showInfo={progress > 0} size='small' />
                    <Text type='secondary'>
                        {calculationRequest &&
                        [RQStatus.QUEUED, RQStatus.STARTED].includes(calculationRequest.status) ?
                            calculationMessage : t('quality.overview.calculation.submitting')}
                    </Text>
                </div>
            )}
            {calculationError && (
                <Alert
                    type='error'
                    showIcon
                    message={t('quality.overview.calculation.failed')}
                    description={calculationError.message}
                    action={(
                        <Button size='small' onClick={onCalculate}>
                            {t('quality.overview.actions.retry')}
                        </Button>
                    )}
                />
            )}
        </section>
    );
}
