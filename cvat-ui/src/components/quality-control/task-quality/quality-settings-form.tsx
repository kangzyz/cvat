// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuestionCircleOutlined } from '@ant-design/icons/lib/icons';
import Text from 'antd/lib/typography/Text';
import InputNumber from 'antd/lib/input-number';
import { Col, Row } from 'antd/lib/grid';
import Divider from 'antd/lib/divider';
import Form, { FormInstance } from 'antd/lib/form';
import Checkbox from 'antd/lib/checkbox/Checkbox';
import Select from 'antd/lib/select';
import CVATTooltip from 'components/common/cvat-tooltip';
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
}

const FilteringComponentBase = ResourceFilterHOC(
    config, localStorageRecentKeyword, localStorageRecentCapacity,
);
const FilteringComponent = FilteringComponentBase as React.ComponentType<
    Omit<React.ComponentProps<typeof FilteringComponentBase>, 'value' | 'onApplyFilter'>
>;

export default function QualitySettingsForm(props: Readonly<Props>): JSX.Element | null {
    const { form, settings, disabled } = props;
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

    const makeTooltipFragment = (metric: string, description: string): JSX.Element => (
        <div>
            <Text strong>{`${metric}:`}</Text>
            <Text>
                {description}
            </Text>
        </div>
    );

    const makeTooltip = (jsx: JSX.Element): JSX.Element => (
        <div className='cvat-settings-tooltip-inner'>
            {jsx}
        </div>
    );

    const generalTooltip = makeTooltip(
        <>
            {makeTooltipFragment(t('quality.tooltipTerms.targetMetric'), t('quality.descriptions.targetMetric'))}
            {makeTooltipFragment(t('quality.tooltipTerms.targetMetricThreshold'), t('quality.descriptions.targetMetricThreshold'))}
            {makeTooltipFragment(t('quality.tooltipTerms.compareAttributes'), t('quality.descriptions.compareAttributes'))}
            {makeTooltipFragment(t('quality.tooltipTerms.emptyFramesAnnotated'), t('quality.descriptions.emptyFramesAnnotated'))}
            {makeTooltipFragment(t('quality.tooltipTerms.jobSelectionFilter'), t('quality.descriptions.jobSelectionFilter'))}
        </>,
    );

    const jobValidationTooltip = makeTooltip(
        makeTooltipFragment(t('quality.tooltipTerms.maxValidationsPerJob'), t('quality.descriptions.maxValidationsPerJob')),
    );

    const shapeComparisonTooltip = makeTooltip(
        <>
            {makeTooltipFragment(t('quality.tooltipTerms.minOverlapThresholdIou'), t('quality.descriptions.iouThreshold'))}
            {makeTooltipFragment(t('quality.tooltipTerms.lowOverlapThreshold'), t('quality.descriptions.lowOverlapThreshold'))}
        </>,
    );

    const keypointTooltip = makeTooltip(
        makeTooltipFragment(t('quality.tooltipTerms.oks'), t('quality.descriptions.oksSigma')),
    );

    const pointTooltip = makeTooltip(
        makeTooltipFragment(t('quality.tooltipTerms.pointSizeBase'), t('quality.descriptions.pointSizeBase')),
    );

    const linesTooltip = makeTooltip(
        <>
            {makeTooltipFragment(t('quality.tooltipTerms.lineThickness'), t('quality.descriptions.lineThickness'))}
            {makeTooltipFragment(t('quality.tooltipTerms.checkOrientation'), t('quality.descriptions.compareLineOrientation'))}
            {makeTooltipFragment(t('quality.tooltipTerms.minSimilarityGain'), t('quality.descriptions.lineOrientationThreshold'))}
        </>,
    );

    const groupTooltip = makeTooltip(
        <>
            {makeTooltipFragment(t('quality.tooltipTerms.compareGroups'), t('quality.descriptions.compareGroups'))}
            {makeTooltipFragment(t('quality.tooltipTerms.minGroupMatchThreshold'), t('quality.descriptions.groupMatchThreshold'))}
        </>,
    );

    const segmentationTooltip = makeTooltip(
        <>
            {makeTooltipFragment(t('quality.tooltipTerms.checkObjectVisibility'), t('quality.descriptions.checkCoveredAnnotations'))}
            {makeTooltipFragment(t('quality.tooltipTerms.minVisibilityThreshold'), t('quality.descriptions.objectVisibilityThreshold'))}
            {makeTooltipFragment(t('quality.tooltipTerms.matchOnlyVisibleParts'), t('quality.descriptions.panopticComparison'))}
        </>,
    );

    return (
        <Form
            form={form}
            layout='vertical'
            className={`cvat-quality-settings-form ${disabled ? 'cvat-quality-settings-form-disabled' : ''}`}
            initialValues={initialValues}
            disabled={disabled}
        >
            <Row className='cvat-quality-settings-title'>
                <Text strong>
                    {t('quality.sections.general')}
                </Text>
                <CVATTooltip title={generalTooltip} className='cvat-settings-tooltip' overlayStyle={{ maxWidth: '500px' }}>
                    <QuestionCircleOutlined
                        style={{ opacity: 0.5 }}
                    />
                </CVATTooltip>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='targetMetric'
                        label={t('quality.fields.targetMetric')}
                        rules={[requiredRule]}
                    >
                        <Select
                            style={{ width: '70%' }}
                            virtual={false}
                        >
                            <Select.Option value={TargetMetric.ACCURACY}>
                                {t('quality.metrics.accuracy')}
                            </Select.Option>
                            <Select.Option value={TargetMetric.PRECISION}>
                                {t('quality.metrics.precision')}
                            </Select.Option>
                            <Select.Option value={TargetMetric.RECALL}>
                                {t('quality.metrics.recall')}
                            </Select.Option>
                        </Select>
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item
                        name='targetMetricThreshold'
                        label={t('quality.fields.targetMetricThreshold')}
                        rules={[requiredRule]}
                    >
                        <InputNumber min={0} max={100} precision={0} />
                    </Form.Item>
                </Col>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='compareAttributes'
                        valuePropName='checked'
                        rules={[requiredRule]}
                    >
                        <Checkbox>
                            <Text className='cvat-text-color'>{t('quality.fields.compareAttributes')}</Text>
                        </Checkbox>
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item
                        name='emptyIsAnnotated'
                        valuePropName='checked'
                        rules={[requiredRule]}
                    >
                        <Checkbox>
                            <Text className='cvat-text-color'>{t('quality.fields.emptyFramesAnnotated')}</Text>
                        </Checkbox>
                    </Form.Item>
                </Col>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='jobFilter'
                        label={t('quality.fields.jobSelectionFilter')}
                        trigger='onApplyFilter'
                    >
                        {/* value and onApplyFilter will be automatically provided by Form.Item */}
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
                                setVisibility({ ...defaultVisibility, builder: visibility.builder, recent: visible })
                            )}
                        />
                    </Form.Item>
                </Col>
            </Row>
            <Divider />
            <Row className='cvat-quality-settings-title'>
                <Text strong>
                    {t('quality.sections.jobValidation')}
                </Text>
                <CVATTooltip title={jobValidationTooltip} className='cvat-settings-tooltip' overlayStyle={{ maxWidth: '500px' }}>
                    <QuestionCircleOutlined
                        style={{ opacity: 0.5 }}
                    />
                </CVATTooltip>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='maxValidationsPerJob'
                        label={t('quality.fields.maxValidationsPerJob')}
                        rules={[requiredRule]}
                    >
                        <InputNumber
                            min={0}
                            max={100}
                            precision={0}
                        />
                    </Form.Item>
                </Col>
            </Row>
            <Divider />
            <Row className='cvat-quality-settings-title'>
                <Text strong>
                    {t('quality.sections.shapeComparison')}
                </Text>
                <CVATTooltip title={shapeComparisonTooltip} className='cvat-settings-tooltip' overlayStyle={{ maxWidth: '500px' }}>
                    <QuestionCircleOutlined
                        style={{ opacity: 0.5 }}
                    />
                </CVATTooltip>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='iouThreshold'
                        label={t('quality.fields.minOverlapThreshold')}
                        rules={[requiredRule]}
                    >
                        <InputNumber min={0} max={100} precision={0} />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item
                        name='lowOverlapThreshold'
                        label={t('quality.fields.lowOverlapThreshold')}
                        rules={[requiredRule]}
                    >
                        <InputNumber min={0} max={100} precision={0} />
                    </Form.Item>
                </Col>
            </Row>
            <Divider />
            <Row className='cvat-quality-settings-title'>
                <Text strong>
                    {t('quality.sections.keypointComparison')}
                </Text>
                <CVATTooltip title={keypointTooltip} className='cvat-settings-tooltip' overlayStyle={{ maxWidth: '500px' }}>
                    <QuestionCircleOutlined
                        style={{ opacity: 0.5 }}
                    />
                </CVATTooltip>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='oksSigma'
                        label={t('quality.fields.oksSigma')}
                        rules={[requiredRule]}
                    >
                        <InputNumber min={0} max={100} precision={0} />
                    </Form.Item>
                </Col>
            </Row>
            <Divider />
            <Row className='cvat-quality-settings-title'>
                <Text strong>
                    {t('quality.sections.pointComparison')}
                </Text>
                <CVATTooltip title={pointTooltip} className='cvat-settings-tooltip' overlayStyle={{ maxWidth: '500px' }}>
                    <QuestionCircleOutlined
                        style={{ opacity: 0.5 }}
                    />
                </CVATTooltip>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='pointSizeBase'
                        label={t('quality.fields.pointSizeBase')}
                        rules={[requiredRule]}
                    >
                        <Select
                            style={{ width: '70%' }}
                            virtual={false}
                        >
                            <Select.Option value={PointSizeBase.IMAGE_SIZE}>
                                {t('quality.pointSizeBase.imageSize')}
                            </Select.Option>
                            <Select.Option value={PointSizeBase.GROUP_BBOX_SIZE}>
                                {t('quality.pointSizeBase.groupBboxSize')}
                            </Select.Option>
                        </Select>
                    </Form.Item>
                </Col>
            </Row>
            <Divider />
            <Row className='cvat-quality-settings-title'>
                <Text strong>
                    {t('quality.sections.lineComparison')}
                </Text>
                <CVATTooltip title={linesTooltip} className='cvat-settings-tooltip' overlayStyle={{ maxWidth: '500px' }}>
                    <QuestionCircleOutlined
                        style={{ opacity: 0.5 }}
                    />
                </CVATTooltip>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='lineThickness'
                        label={t('quality.fields.relativeThickness')}
                        rules={[requiredRule]}
                    >
                        <InputNumber min={0} max={1000} precision={0} />
                    </Form.Item>
                </Col>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='compareLineOrientation'
                        rules={[requiredRule]}
                        valuePropName='checked'
                    >
                        <Checkbox>
                            <Text className='cvat-text-color'>{t('quality.fields.checkOrientation')}</Text>
                        </Checkbox>
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item
                        name='lineOrientationThreshold'
                        label={t('quality.fields.minSimilarityGain')}
                        rules={[requiredRule]}
                    >
                        <InputNumber min={0} max={100} precision={0} />
                    </Form.Item>
                </Col>
            </Row>
            <Divider />
            <Row className='cvat-quality-settings-title'>
                <Text strong>
                    {t('quality.sections.groupComparison')}
                </Text>
                <CVATTooltip title={groupTooltip} className='cvat-settings-tooltip' overlayStyle={{ maxWidth: '500px' }}>
                    <QuestionCircleOutlined
                        style={{ opacity: 0.5 }}
                    />
                </CVATTooltip>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='compareGroups'
                        valuePropName='checked'
                        rules={[requiredRule]}
                    >
                        <Checkbox>
                            <Text className='cvat-text-color'>{t('quality.fields.compareGroups')}</Text>
                        </Checkbox>
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item
                        name='groupMatchThreshold'
                        label={t('quality.fields.minGroupMatchThreshold')}
                        rules={[requiredRule]}
                    >
                        <InputNumber min={0} max={100} precision={0} />
                    </Form.Item>
                </Col>
            </Row>
            <Divider />
            <Row className='cvat-quality-settings-title'>
                <Text strong>
                    {t('quality.sections.segmentationComparison')}
                </Text>
                <CVATTooltip title={segmentationTooltip} className='cvat-settings-tooltip' overlayStyle={{ maxWidth: '500px' }}>
                    <QuestionCircleOutlined
                        style={{ opacity: 0.5 }}
                    />
                </CVATTooltip>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='checkCoveredAnnotations'
                        valuePropName='checked'
                        rules={[requiredRule]}
                    >
                        <Checkbox>
                            <Text className='cvat-text-color'>{t('quality.fields.checkObjectVisibility')}</Text>
                        </Checkbox>
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item
                        name='objectVisibilityThreshold'
                        label={t('quality.fields.minVisibilityThreshold')}
                        rules={[requiredRule]}
                    >
                        <InputNumber min={0} max={100} precision={0} />
                    </Form.Item>
                </Col>
            </Row>
            <Row>
                <Col span={12}>
                    <Form.Item
                        name='panopticComparison'
                        valuePropName='checked'
                        rules={[requiredRule]}
                    >
                        <Checkbox>
                            <Text className='cvat-text-color'>{t('quality.fields.matchOnlyVisibleParts')}</Text>
                        </Checkbox>
                    </Form.Item>
                </Col>
            </Row>
        </Form>
    );
}
