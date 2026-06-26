// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';

import React, { useMemo } from 'react';
import { useHistory, useParams } from 'react-router';
import Layout from 'antd/lib/layout';
import Menu from 'antd/lib/menu';
import Title from 'antd/lib/typography/Title';
import MDEditor from '@uiw/react-md-editor';
import rehypeSanitize from 'rehype-sanitize';

import CVATLogo from 'components/common/cvat-logo';
import GoBackButton from 'components/common/go-back-button';
import docPages from './content';

function DocumentationPage(): JSX.Element {
    const history = useHistory();
    const { slug } = useParams<{ slug?: string }>();

    const activeSlug = useMemo(() => {
        if (slug && docPages.some((page) => page.slug === slug)) {
            return slug;
        }
        return docPages[0].slug;
    }, [slug]);

    const activePage = docPages.find((page) => page.slug === activeSlug) ?? docPages[0];

    return (
        <Layout className='cvat-documentation-page'>
            <Layout.Sider className='cvat-documentation-page-sidebar' width={260} theme='light'>
                <div className='cvat-documentation-page-sidebar-header'>
                    <CVATLogo />
                    <Title level={5}>使用指南</Title>
                </div>
                <Menu
                    mode='inline'
                    selectedKeys={[activeSlug]}
                    onClick={({ key }) => history.push(`/documentation/${key}`)}
                    items={docPages.map((page) => ({ key: page.slug, label: page.title }))}
                />
            </Layout.Sider>
            <Layout.Content className='cvat-documentation-page-content'>
                <div className='cvat-documentation-page-top'>
                    <GoBackButton />
                </div>
                <div className='cvat-documentation-page-markdown' data-color-mode='light'>
                    <MDEditor.Markdown
                        source={activePage.content}
                        rehypePlugins={[[rehypeSanitize]]}
                    />
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default React.memo(DocumentationPage);
