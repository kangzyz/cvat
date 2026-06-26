// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';

import React, { useMemo } from 'react';
import { useHistory, useParams } from 'react-router';
import Layout from 'antd/lib/layout';
import Menu from 'antd/lib/menu';
import Title from 'antd/lib/typography/Title';
import Text from 'antd/lib/typography/Text';
import { ReadOutlined } from '@ant-design/icons';
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

    const activeIndex = docPages.findIndex((page) => page.slug === activeSlug);
    const activePage = docPages[activeIndex] ?? docPages[0];

    return (
        <Layout className='cvat-documentation-page'>
            <Layout.Sider className='cvat-documentation-page-sidebar' width={272} theme='light'>
                <div className='cvat-documentation-page-sidebar-header'>
                    <CVATLogo />
                    <div className='cvat-documentation-page-sidebar-title'>
                        <Title level={5}>使用指南</Title>
                        <Text type='secondary'>社区版 · 中文文档</Text>
                    </div>
                </div>
                <Menu
                    className='cvat-documentation-page-menu'
                    mode='inline'
                    selectedKeys={[activeSlug]}
                    onClick={({ key }) => history.push(`/documentation/${key}`)}
                    items={docPages.map((page) => ({
                        key: page.slug,
                        icon: <ReadOutlined />,
                        label: page.title,
                    }))}
                />
            </Layout.Sider>
            <Layout.Content className='cvat-documentation-page-content cvat-scrollbar'>
                <div className='cvat-documentation-page-toolbar'>
                    <GoBackButton />
                    <div className='cvat-documentation-page-breadcrumb'>
                        <ReadOutlined />
                        <Text type='secondary'>使用指南</Text>
                        <Text type='secondary'>/</Text>
                        <Text strong>{activePage.title}</Text>
                    </div>
                </div>
                <article className='cvat-documentation-page-article'>
                    <div className='cvat-documentation-page-markdown' data-color-mode='light'>
                        <MDEditor.Markdown
                            source={activePage.content}
                            rehypePlugins={[[rehypeSanitize]]}
                        />
                    </div>
                    <nav className='cvat-documentation-page-pager'>
                        {activeIndex > 0 ? (
                            <button
                                type='button'
                                className='cvat-documentation-page-pager-prev'
                                onClick={() => history.push(`/documentation/${docPages[activeIndex - 1].slug}`)}
                            >
                                <Text type='secondary'>← 上一篇</Text>
                                <Text strong>{docPages[activeIndex - 1].title}</Text>
                            </button>
                        ) : <span />}
                        {activeIndex < docPages.length - 1 ? (
                            <button
                                type='button'
                                className='cvat-documentation-page-pager-next'
                                onClick={() => history.push(`/documentation/${docPages[activeIndex + 1].slug}`)}
                            >
                                <Text type='secondary'>下一篇 →</Text>
                                <Text strong>{docPages[activeIndex + 1].title}</Text>
                            </button>
                        ) : <span />}
                    </nav>
                </article>
            </Layout.Content>
        </Layout>
    );
}

export default React.memo(DocumentationPage);
