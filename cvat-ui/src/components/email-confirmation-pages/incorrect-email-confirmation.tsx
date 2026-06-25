// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Col, Row } from 'antd/lib/grid';
import Layout from 'antd/lib/layout';
import Button from 'antd/lib/button';
import './styles.scss';

const { Content } = Layout;

/**
 * Component for displaying message that email confirmation URL is incorrect
 */

export default function IncorrectEmailConfirmationPage(): JSX.Element {
    const { t } = useTranslation('auth');
    return (
        <Layout>
            <Content>
                <Row justify='center' align='middle' id='incorrect-email-confirmation-page-container'>
                    <Col>
                        <h1>
                            {t('emailConfirmation.invalidLinkTitle')}
                        </h1>
                        <p>
                            {t('emailConfirmation.invalidLinkDescription')}
                        </p>
                        <Button className='cvat-go-to-login-button' type='link' href='/auth/login'>
                            {t('emailConfirmation.goToLogin')}
                        </Button>
                    </Col>
                </Row>
            </Content>
        </Layout>
    );
}
