// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';

import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Row, Col } from 'antd/lib/grid';
import Tabs, { TabsProps } from 'antd/lib/tabs';
import Title from 'antd/lib/typography/Title';
import Result from 'antd/lib/result';
import Spin from 'antd/lib/spin';

import { DimensionType, Project, Task } from 'cvat-core-wrapper';
import {
    calculateQualityReportAsync,
    initializeQualityControlAsync,
    qualityControlActions,
    saveQualitySettingsAsync,
    UpdateQualitySettingsData,
    updateQualityValidationAsync,
} from 'actions/quality-control-actions';
import { CombinedState, InstanceType } from 'reducers';
import CVATLoadingSpinner from 'components/common/loading-spinner';
import GoBackButton from 'components/common/go-back-button';
import ResourceLink from 'components/common/resource-link';
import { ThunkDispatch } from 'utils/redux';
import { getTabFromHash } from 'utils/location-utils';
import { useInstanceId, useInstanceType } from 'utils/hooks';
import QualityOverviewTab from './quality-overview-tab';
import QualityManagementTab from './task-quality/quality-magement-tab';
import QualitySettingsTab from './quality-settings-tab';
import { isGroundTruthReady } from './quality-control-utils';

const supportedTabs = ['overview', 'settings', 'management'];

function QualityControlPage(): JSX.Element {
    const { t } = useTranslation('qualityReviewModels');
    const dispatch = useDispatch<ThunkDispatch>();
    const state = useSelector((combined: CombinedState) => combined.qualityControl);
    const [activeTab, setActiveTab] = useState(getTabFromHash(supportedTabs));
    const requestedInstanceType: InstanceType = useInstanceType();
    const requestedInstanceID = useInstanceId(requestedInstanceType);
    const expectedResourceKey = `${requestedInstanceType}:${requestedInstanceID}`;

    useEffect(() => {
        dispatch(initializeQualityControlAsync(requestedInstanceType, requestedInstanceID));
        setActiveTab(getTabFromHash(supportedTabs));
        return () => {
            dispatch(qualityControlActions.reset(expectedResourceKey));
        };
    }, [dispatch, requestedInstanceType, requestedInstanceID, expectedResourceKey]);

    useEffect(() => {
        const onHashChange = (): void => setActiveTab(getTabFromHash(supportedTabs));
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    useEffect(() => {
        window.history.replaceState(null, '', `#${activeTab}`);
    }, [activeTab]);

    const onSaveQualitySettings = useCallback((updates: UpdateQualitySettingsData): void => {
        if (state.resourceKey) dispatch(saveQualitySettingsAsync(state.resourceKey, updates));
    }, [dispatch, state.resourceKey]);

    const onUpdateFrames = useCallback((operation: 'delete' | 'restore', frameIDs: number[]): void => {
        if (state.resourceKey) dispatch(updateQualityValidationAsync(state.resourceKey, operation, frameIDs));
    }, [dispatch, state.resourceKey]);

    const backNavigation = (
        <Row justify='center'>
            <Col span={22} xl={20} xxl={18} className='cvat-task-top-bar'>
                <GoBackButton />
            </Col>
        </Row>
    );

    if (state.resourceKey !== expectedResourceKey || state.fetching) {
        return (
            <div className='cvat-quality-control-page'>
                <div className='cvat-quality-control-loading'><CVATLoadingSpinner /></div>
            </div>
        );
    }

    if (state.error || !state.instance) {
        return (
            <div className='cvat-quality-control-page'>
                <div className='cvat-quality-control-page-error'>
                    <Result
                        status='error'
                        title={t('quality.couldNotOpenPage')}
                        subTitle={state.error?.message}
                        extra={backNavigation}
                    />
                </div>
            </div>
        );
    }

    const { instance } = state;
    const effectiveQualitySettings = instance instanceof Task && state.settings.current?.inherit ?
        state.settings.parent || state.settings.current : state.settings.current;
    const tabsItems: NonNullable<TabsProps['items']>[0][] = [{
        key: 'overview',
        label: t('quality.tabs.overview'),
        children: (
            <QualityOverviewTab
                instance={instance}
                qualitySettings={{
                    settings: state.settings.current,
                    childrenSettings: state.settings.children,
                }}
            />
        ),
    }];

    if (
        instance instanceof Task &&
        state.gtJob && state.gtJobMeta && state.validationLayout && effectiveQualitySettings
    ) {
        tabsItems.push({
            key: 'management',
            label: t('quality.tabs.management'),
            children: (
                <Spin className='cvat-quality-management-saving' spinning={state.validationSaving}>
                    <QualityManagementTab
                        task={instance}
                        gtJobId={state.gtJob.id}
                        gtJobMeta={state.gtJobMeta}
                        validationLayout={state.validationLayout}
                        qualitySettings={effectiveQualitySettings}
                        onDeleteFrames={(frames) => onUpdateFrames('delete', frames)}
                        onRestoreFrames={(frames) => onUpdateFrames('restore', frames)}
                    />
                </Spin>
            ),
        });
    }

    if (state.settings.current) {
        const activeValidationFrames = state.validationLayout ? Math.max(
            0,
            state.validationLayout.validationFrames.length - state.validationLayout.disabledFrames.length,
        ) : 0;
        const canRecalculate = instance instanceof Project || (
            instance.dimension === DimensionType.DIMENSION_2D &&
            isGroundTruthReady(state.gtJob) && activeValidationFrames > 0
        );
        tabsItems.push({
            key: 'settings',
            label: t('quality.tabs.settings'),
            children: (
                <QualitySettingsTab
                    instance={instance}
                    fetching={state.settings.saving}
                    qualitySettings={{
                        settings: state.settings.current,
                        childrenSettings: state.settings.children,
                    }}
                    justSaved={state.settings.justSaved}
                    error={state.settings.error}
                    canRecalculate={canRecalculate}
                    setQualitySettings={onSaveQualitySettings}
                    onRecalculate={() => {
                        setActiveTab('overview');
                        window.location.hash = 'overview';
                        if (state.resourceKey) dispatch(calculateQualityReportAsync(state.resourceKey));
                    }}
                    onDismissSaved={() => {
                        if (state.resourceKey) dispatch(qualityControlActions.dismissSettingsSaved(state.resourceKey));
                    }}
                />
            ),
        });
    }

    const renderedActiveTab = tabsItems.some(({ key }) => key === activeTab) ? activeTab : 'overview';

    return (
        <Row className='cvat-quality-control-page'>
            <Col className='cvat-quality-control-wrapper' span={24}>
                {backNavigation}
                <Row justify='center' className='cvat-quality-control-inner-wrapper'>
                    <Col span={22} xl={20} xxl={18} className='cvat-quality-control-inner'>
                        <Col className='cvat-quality-page-header'>
                            <Title level={4} className='cvat-text-color'>
                                {t('quality.titlePrefix')}
                                <ResourceLink resource={instance as Project | Task} />
                            </Title>
                        </Col>
                        <Tabs
                            activeKey={renderedActiveTab}
                            onChange={setActiveTab}
                            className='cvat-quality-control-page-tabs'
                            items={tabsItems}
                        />
                    </Col>
                </Row>
            </Col>
        </Row>
    );
}

export default React.memo(QualityControlPage);
