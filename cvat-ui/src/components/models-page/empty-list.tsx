// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useTranslation } from 'react-i18next';
import Text from 'antd/lib/typography/Text';
import { Row, Col } from 'antd/lib/grid';
import Empty from 'antd/lib/empty';

import config from 'config';

export default function EmptyListComponent(): JSX.Element {
    const { t } = useTranslation('qualityReviewModels');

    return (
        <div className='cvat-empty-models-list'>
            <Empty
                description={(
                    <div>
                        <Row justify='center' align='middle'>
                            <Col>
                                <Text strong>{t('models.emptyTitle')}</Text>
                            </Col>
                        </Row>
                        <Row justify='center' align='middle'>
                            <Col>
                                <Text type='secondary'>{t('models.emptyHint')}</Text>
                            </Col>
                        </Row>
                        <Row justify='center' align='middle'>
                            <Col>
                                <Text type='secondary'>{t('models.emptyAction')} </Text>
                                <a href={`${config.NUCLIO_GUIDE}`}>{t('models.emptyTool')}</a>
                            </Col>
                        </Row>
                    </div>
                )}
            />
        </div>
    );
}
