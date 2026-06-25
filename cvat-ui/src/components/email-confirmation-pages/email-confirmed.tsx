// Copyright (C) 2021-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Col, Row } from 'antd/lib/grid';
import Layout from 'antd/lib/layout';
import Statistic from 'antd/lib/statistic';
import './styles.scss';

const { Content } = Layout;
const { Countdown } = Statistic;

/**
 * Component for displaying email confirmation message and then redirecting to the login page
 */

function EmailConfirmationPage(): JSX.Element {
    const { t } = useTranslation('auth');
    const linkRef = useRef<HTMLAnchorElement>(null);
    const onFinish = (): void => {
        linkRef.current?.click();
    };
    return (
        <Layout>
            <Content>
                <Row justify='center' align='middle' id='email-confirmation-page-container'>
                    <Col>
                        <h1>{t('emailConfirmation.confirmedTitle')}</h1>
                        <Countdown format='ss' title={t('emailConfirmation.redirectTitle')} value={Date.now() + 1000 * 6} onFinish={onFinish} />
                        <Link to='/auth/login' ref={linkRef}>{t('emailConfirmation.manualLoginLink')}</Link>
                    </Col>
                </Row>
            </Content>
        </Layout>
    );
}

export default EmailConfirmationPage;
