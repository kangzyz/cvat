// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Checkbox from 'antd/lib/checkbox/Checkbox';
import Collapse from 'antd/lib/collapse';
import Form, { FormInstance } from 'antd/lib/form';
import { Col, Row } from 'antd/lib/grid';
import InputNumber from 'antd/lib/input-number';
import Select from 'antd/lib/select';
import Text from 'antd/lib/typography/Text';

import { QualitySettings, TargetMetric } from 'cvat-core-wrapper';
import { PointSizeBase } from 'cvat-core/src/quality-settings';
import { defaultVisibility, ResourceFilterHOC } from 'components/resource-sorting-filtering';
import {
    localStorageRecentKeyword, localStorageRecentCapacity, config,
} from './jobs-filter-configuration';

interface Props {
    form: FormInstance;
    settings: QualitySettings;
    disabled: boolean;
    onSave: () => void;
    onValuesChange: () => void;
}

const FilteringComponentBase = ResourceFilterHOC(
    config, localStorageRecentKeyword, localStorageRecentCapacity,
);
const FilteringComponent = FilteringComponentBase as React.ComponentType<
    Omit<React.ComponentProps<typeof FilteringComponentBase>, 'value' | 'onApplyFilter'>
>;

export default function QualitySettingsForm(props: Readonly<Props>): JSX.Element {
    const {
        form,
        settings,
        disabled,
        onSave,
        onValuesChange,
    } = props;
    const { t } = useTranslation('qualityReviewModels');
    const [visibility, setVisibility] = useState(defaultVisibility);
    const requiredRule = { required: true, message: t('common.fieldRequired') };
    const initialValues = {
        targetMetric: settings.targetMetric,
        targetMetricThreshold: settings.targetMetricThreshold * 100,
        maxValidationsPerJob: settings.maxValidationsPerJob,
        lowOverlapThreshold: settings.lowOverlapThreshold * 100,
        iouThreshold: settings.iouThreshold * 100,
        compareAttributes: settings.compareAttributes,
        emptyIsAnnotated: settings.emptyIsAnnotated,
        oksSigma: settings.oksSigma * 100,
        pointSizeBase: settings.pointSizeBase,
        lineThickness: settings.lineThickness * 100,
        lineOrientationThreshold: settings.lineOrientationThreshold * 100,
        compareLineOrientation: settings.compareLineOrientation,
        compareGroups: settings.compareGroups,
        groupMatchThreshold: settings.groupMatchThreshold * 100,
        checkCoveredAnnotations: settings.checkCoveredAnnotations,
        objectVisibilityThreshold: settings.objectVisibilityThreshold * 100,
        panopticComparison: settings.panopticComparison,
        jobFilter: settings.jobFilter,
    };
    const field = (
        name: string,
        label: string,
        description: string,
        control: JSX.Element,
        options: { checked?: boolean; span?: number } = {},
    ): JSX.Element => (
        <Col xs={24} md={options.span || 12}>
            <Form.Item
                name={name}
                label={options.checked ? undefined : label}
                extra={description}
                valuePropName={options.checked ? 'checked' : 'value'}
                rules={[requiredRule]}
            >
                {options.checked ? (
                    <Checkbox><Text className='cvat-text-color'>{label}</Text></Checkbox>
                ) : control}
            </Form.Item>
        </Col>
    );
    const percentInput = <InputNumber min={0} max={100} precision={1} addonAfter='%' />;

    const groups = [
        {
            key: 'gate',
            label: t('quality.settingsGroups.gate'),
            children: (
                <Row gutter={[24, 4]}>
                    {field(
                        'targetMetric',
                        t('quality.fields.targetMetric'),
                        t('quality.descriptions.targetMetric'),
                        <Select virtual={false}>
                            <Select.Option value={TargetMetric.ACCURACY}>{t('quality.metrics.accuracy')}</Select.Option>
                            <Select.Option value={TargetMetric.PRECISION}>{t('quality.metrics.precision')}</Select.Option>
                            <Select.Option value={TargetMetric.RECALL}>{t('quality.metrics.recall')}</Select.Option>
                        </Select>,
                    )}
                    {field(
                        'targetMetricThreshold',
                        t('quality.fields.targetMetricThreshold'),
                        t('quality.descriptions.targetMetricThreshold'),
                        percentInput,
                    )}
                </Row>
            ),
        },
        {
            key: 'scope',
            label: t('quality.settingsGroups.scope'),
            children: (
                <Row gutter={[24, 4]}>
                    {field(
                        'maxValidationsPerJob',
                        t('quality.fields.maxValidationsPerJob'),
                        t('quality.descriptions.maxValidationsPerJob'),
                        <InputNumber min={0} max={100} precision={0} />,
                    )}
                    {field(
                        'emptyIsAnnotated',
                        t('quality.fields.emptyFramesAnnotated'),
                        t('quality.descriptions.emptyFramesAnnotated'),
                        <Checkbox />,
                        { checked: true },
                    )}
                    <Col xs={24}>
                        <Form.Item
                            name='jobFilter'
                            label={t('quality.fields.jobSelectionFilter')}
                            extra={t('quality.descriptions.jobSelectionFilter')}
                            trigger='onApplyFilter'
                        >
                            <FilteringComponent
                                predefinedVisible={visibility.predefined}
                                builderVisible={visibility.builder}
                                recentVisible={visibility.recent}
                                onPredefinedVisibleChange={(visible: boolean) => (
                                    setVisibility({ ...defaultVisibility, predefined: visible })
                                )}
                                onBuilderVisibleChange={(visible: boolean) => (
                                    setVisibility({ ...defaultVisibility, builder: visible })
                                )}
                                onRecentVisibleChange={(visible: boolean) => (
                                    setVisibility({
                                        ...defaultVisibility,
                                        builder: visibility.builder,
                                        recent: visible,
                                    })
                                )}
                            />
                        </Form.Item>
                    </Col>
                </Row>
            ),
        },
        {
            key: 'matching',
            label: t('quality.settingsGroups.matching'),
            children: (
                <Row gutter={[24, 4]}>
                    {field(
                        'iouThreshold',
                        t('quality.fields.minOverlapThreshold'),
                        t('quality.descriptions.iouThreshold'),
                        percentInput,
                    )}
                    {field(
                        'lowOverlapThreshold',
                        t('quality.fields.lowOverlapThreshold'),
                        t('quality.descriptions.lowOverlapThreshold'),
                        percentInput,
                    )}
                    {field(
                        'compareAttributes',
                        t('quality.fields.compareAttributes'),
                        t('quality.descriptions.compareAttributes'),
                        <Checkbox />,
                        { checked: true },
                    )}
                </Row>
            ),
        },
        {
            key: 'points',
            label: t('quality.settingsGroups.points'),
            children: (
                <Row gutter={[24, 4]}>
                    {field(
                        'oksSigma',
                        t('quality.fields.oksSigma'),
                        t('quality.descriptions.oksSigma'),
                        percentInput,
                    )}
                    {field(
                        'pointSizeBase',
                        t('quality.fields.pointSizeBase'),
                        t('quality.descriptions.pointSizeBase'),
                        <Select virtual={false}>
                            <Select.Option value={PointSizeBase.IMAGE_SIZE}>
                                {t('quality.pointSizeBase.imageSize')}
                            </Select.Option>
                            <Select.Option value={PointSizeBase.GROUP_BBOX_SIZE}>
                                {t('quality.pointSizeBase.groupBboxSize')}
                            </Select.Option>
                        </Select>,
                    )}
                </Row>
            ),
        },
        {
            key: 'lines',
            label: t('quality.settingsGroups.lines'),
            children: (
                <Row gutter={[24, 4]}>
                    {field(
                        'lineThickness',
                        t('quality.fields.relativeThickness'),
                        t('quality.descriptions.lineThickness'),
                        <InputNumber min={0} max={1000} precision={1} addonAfter='%' />,
                    )}
                    {field(
                        'lineOrientationThreshold',
                        t('quality.fields.minSimilarityGain'),
                        t('quality.descriptions.lineOrientationThreshold'),
                        percentInput,
                    )}
                    {field(
                        'compareLineOrientation',
                        t('quality.fields.checkOrientation'),
                        t('quality.descriptions.compareLineOrientation'),
                        <Checkbox />,
                        { checked: true },
                    )}
                </Row>
            ),
        },
        {
            key: 'groups',
            label: t('quality.settingsGroups.groups'),
            children: (
                <Row gutter={[24, 4]}>
                    {field(
                        'compareGroups',
                        t('quality.fields.compareGroups'),
                        t('quality.descriptions.compareGroups'),
                        <Checkbox />,
                        { checked: true },
                    )}
                    {field(
                        'groupMatchThreshold',
                        t('quality.fields.minGroupMatchThreshold'),
                        t('quality.descriptions.groupMatchThreshold'),
                        percentInput,
                    )}
                </Row>
            ),
        },
        {
            key: 'segmentation',
            label: t('quality.settingsGroups.segmentation'),
            children: (
                <Row gutter={[24, 4]}>
                    {field(
                        'checkCoveredAnnotations',
                        t('quality.fields.checkObjectVisibility'),
                        t('quality.descriptions.checkCoveredAnnotations'),
                        <Checkbox />,
                        { checked: true },
                    )}
                    {field(
                        'objectVisibilityThreshold',
                        t('quality.fields.minVisibilityThreshold'),
                        t('quality.descriptions.objectVisibilityThreshold'),
                        percentInput,
                    )}
                    {field(
                        'panopticComparison',
                        t('quality.fields.matchOnlyVisibleParts'),
                        t('quality.descriptions.panopticComparison'),
                        <Checkbox />,
                        { checked: true },
                    )}
                </Row>
            ),
        },
    ];

    return (
        <Form
            form={form}
            layout='vertical'
            className={`cvat-quality-settings-form ${disabled ? 'cvat-quality-settings-form-disabled' : ''}`}
            initialValues={initialValues}
            disabled={disabled}
            onFinish={onSave}
            onValuesChange={onValuesChange}
        >
            <Collapse
                className='cvat-quality-settings-groups'
                defaultActiveKey={['gate', 'scope']}
                items={groups}
            />
        </Form>
    );
}
