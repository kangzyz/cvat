// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useTranslation } from 'react-i18next';
import Title from 'antd/lib/typography/Title';
import Text from 'antd/lib/typography/Text';
import { Row, Col } from 'antd/lib/grid';

import { Project, Task, Job } from 'cvat-core-wrapper';
import ResourceLink from 'components/common/resource-link';

interface Props {
    resource: Project | Task | Job;
}

function AnalyticsPageHeader({ resource }: Props): JSX.Element {
    const { t } = useTranslation('resources');
    return (
        <Row justify='space-between' align='middle'>
            <Col className='cvat-analytics-header'>
                <Title level={4} className='cvat-text-color'>
                    {t('analytics.title')} <ResourceLink resource={resource} />
                </Title>
                <Text type='secondary'>{t('analytics.subtitle')}</Text>
            </Col>
        </Row>
    );
}

export default React.memo(AnalyticsPageHeader);
