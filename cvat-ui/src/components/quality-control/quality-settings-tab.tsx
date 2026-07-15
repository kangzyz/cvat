// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Text from 'antd/lib/typography/Text';
import Form from 'antd/lib/form';
import Switch from 'antd/lib/switch';
import { Col, Row } from 'antd/lib/grid';
import Button from 'antd/lib/button';
import Alert from 'antd/lib/alert';
import { ExclamationCircleFilled } from '@ant-design/icons/lib/icons';
import Modal from 'antd/lib/modal';
import {
    Project, QualitySettings, QualitySettingsSaveFields, Task,
} from 'cvat-core-wrapper';
import { UpdateQualitySettingsData } from 'actions/quality-control-actions';
import CVATLoadingSpinner from 'components/common/loading-spinner';
import QualitySettingsForm from './task-quality/quality-settings-form';

interface Props {
    instance: Task | Project;
    fetching: boolean;
    qualitySettings: {
        settings: QualitySettings | null;
        childrenSettings: QualitySettings[] | null;
    };
    justSaved: boolean;
    error: Error | null;
    setQualitySettings: (updatedSettingsData: UpdateQualitySettingsData) => void;
    onRecalculate: () => void;
    canRecalculate: boolean;
    onDismissSaved: () => void;
}

function QualitySettingsTab(props: Readonly<Props>): JSX.Element | null {
    const {
        instance,
        fetching,
        qualitySettings: { settings, childrenSettings },
        justSaved,
        error,
        setQualitySettings,
        onRecalculate,
        canRecalculate,
        onDismissSaved,
    } = props;
    const { t } = useTranslation('qualityReviewModels');

    const [form] = Form.useForm();
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        setDirty(false);
    }, [settings?.id, settings?.updatedDate]);

    const onSave = useCallback(async () => {
        if (settings) {
            const values = await form.validateFields();
            const fields: QualitySettingsSaveFields = {
                targetMetric: values.targetMetric,
                targetMetricThreshold: values.targetMetricThreshold / 100,
                maxValidationsPerJob: values.maxValidationsPerJob,
                lowOverlapThreshold: values.lowOverlapThreshold / 100,
                iouThreshold: values.iouThreshold / 100,
                compareAttributes: values.compareAttributes,
                emptyIsAnnotated: values.emptyIsAnnotated,
                oksSigma: values.oksSigma / 100,
                pointSizeBase: values.pointSizeBase,
                lineThickness: values.lineThickness / 100,
                lineOrientationThreshold: values.lineOrientationThreshold / 100,
                compareLineOrientation: values.compareLineOrientation,
                compareGroups: values.compareGroups,
                groupMatchThreshold: values.groupMatchThreshold / 100,
                checkCoveredAnnotations: values.checkCoveredAnnotations,
                objectVisibilityThreshold: values.objectVisibilityThreshold / 100,
                panopticComparison: values.panopticComparison,
                jobFilter: values.jobFilter ?? '',
            };
            setQualitySettings({ [settings.id]: { settings, fields } });
        }
    }, [form, settings, setQualitySettings]);

    const onInheritChange = useCallback((value: boolean) => {
        if (settings) {
            setQualitySettings({ [settings.id]: { settings, fields: { inherit: value } } });
        }
    }, [settings, setQualitySettings]);

    const nonInheritedChildSettings = childrenSettings ? childrenSettings.filter((child) => !child.inherit) : [];
    const onChildInheritChange = useCallback(() => {
        const updatedSettings = nonInheritedChildSettings.reduce<UpdateQualitySettingsData>((acc, child) => {
            acc[child.id] = {
                settings: child,
                fields: { inherit: true },
            };
            return acc;
        }, {});
        setQualitySettings(updatedSettings);
    }, [nonInheritedChildSettings, setQualitySettings]);

    if (fetching && !settings) {
        return (
            <div className='cvat-quality-control-settings-tab'>
                <div className='cvat-quality-control-loading'>
                    <CVATLoadingSpinner />
                </div>
            </div>
        );
    }

    let header: JSX.Element | null = null;
    if (instance instanceof Task && instance.projectId !== null) {
        header = (
            <div className='cvat-quality-control-settings-header'>
                <Switch checked={settings?.inherit} onChange={onInheritChange} />
                <Link to={`/projects/${instance.projectId}/quality-control#settings`}>
                    {t('quality.useProjectSettings')}
                </Link>
            </div>
        );
    } else if (instance instanceof Project && nonInheritedChildSettings.length !== 0) {
        header = (
            <div className='cvat-quality-control-settings-header'>
                <Alert
                    type='warning'
                    message={(
                        <div>
                            <ExclamationCircleFilled className='ant-alert-icon' />
                            <Text>{t('quality.ownSettingsUsed', { count: nonInheritedChildSettings.length })}</Text>
                        </div>
                    )}
                    action={(
                        <Button
                            type='primary'
                            danger
                            onClick={() => {
                                Modal.confirm({
                                    title: t('quality.forceProjectSettingsTitle'),
                                    icon: <ExclamationCircleFilled />,
                                    content: t('quality.forceProjectSettingsContent'),
                                    okText: t('common.yes'),
                                    cancelText: t('common.no'),
                                    onOk: onChildInheritChange,
                                });
                            }}
                        >
                            {t('quality.forceProjectSettings')}
                        </Button>
                    )}
                />
            </div>
        );
    }

    if (settings) {
        return (
            <div className='cvat-quality-control-settings-tab'>
                {header}
                {justSaved && (
                    <Alert
                        className='cvat-quality-settings-feedback'
                        type='success'
                        showIcon
                        message={t('quality.settingsSavedStale')}
                        action={(
                            <>
                                <Button
                                    size='small'
                                    type='primary'
                                    disabled={!canRecalculate}
                                    onClick={onRecalculate}
                                >
                                    {t('quality.overview.actions.recalculate')}
                                </Button>
                                <Button size='small' type='text' onClick={onDismissSaved}>
                                    {t('quality.settingsLater')}
                                </Button>
                            </>
                        )}
                    />
                )}
                {error && (
                    <Alert
                        className='cvat-quality-settings-feedback'
                        type='error'
                        showIcon
                        message={t('quality.couldNotSaveSettings')}
                        description={error.message}
                    />
                )}
                <QualitySettingsForm
                    key={`${settings.id}-${settings.updatedDate || ''}`}
                    form={form}
                    settings={settings}
                    onSave={onSave}
                    onValuesChange={() => setDirty(true)}
                    disabled={settings.inherit && instance instanceof Task && instance.projectId !== null}
                />
                <Row justify='space-between' align='middle' className='cvat-quality-settings-action-bar'>
                    <Col>
                        <Text type='secondary'>
                            {dirty ? t('quality.settingsUnsaved') : t('quality.settingsSaved')}
                        </Text>
                    </Col>
                    <Col>
                        <Button
                            onClick={onSave}
                            type='primary'
                            loading={fetching}
                            disabled={
                                !dirty ||
                                (settings.inherit && instance instanceof Task && instance.projectId !== null)
                            }
                        >
                            {t('common.save')}
                        </Button>
                    </Col>
                </Row>
            </div>
        );
    }

    return null;
}

export default React.memo(QualitySettingsTab);
