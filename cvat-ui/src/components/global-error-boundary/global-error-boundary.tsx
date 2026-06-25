// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React from 'react';
import { connect } from 'react-redux';
import Result from 'antd/lib/result';
import Text from 'antd/lib/typography/Text';
import Paragraph from 'antd/lib/typography/Paragraph';
import Collapse from 'antd/lib/collapse';
import TextArea from 'antd/lib/input/TextArea';

import { ThunkDispatch } from 'utils/redux';
import { resetAfterErrorAsync } from 'actions/boundaries-actions';
import { CombinedState } from 'reducers';
import { logError } from 'cvat-logger';
import config from 'config';

interface OwnProps {
    children: JSX.Element;
}

interface StateToProps {
    job: any | null;
    serverVersion: string;
    uiVersion: string;
}

interface DispatchToProps {
    restore(): void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

function mapStateToProps(state: CombinedState): StateToProps {
    const {
        annotation: {
            job: { instance: job },
        },
        about: { server, packageVersion },
    } = state;

    return {
        job,
        serverVersion: server.version as string,
        uiVersion: packageVersion.ui,
    };
}

function mapDispatchToProps(dispatch: ThunkDispatch): DispatchToProps {
    return {
        restore(): void {
            dispatch(resetAfterErrorAsync());
        },
    };
}

type Props = StateToProps & DispatchToProps & OwnProps;
class GlobalErrorBoundary extends React.PureComponent<Props, State> {
    public constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error,
        };
    }

    public componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        logError(error, true, {
            type: 'component',
            componentStack: errorInfo.componentStack,
        });
    }

    public render(): React.ReactNode {
        const {
            restore, job, serverVersion, uiVersion,
        } = this.props;

        const { hasError, error } = this.state;

        const restoreGlobalState = (): void => {
            this.setState({
                error: null,
                hasError: false,
            });

            restore();
        };

        if (hasError && error) {
            const message = `${error.name}\n${error.message}\n\n${error.stack}`;
            return (
                <div className='cvat-global-boundary'>
                    <Result
                        status='error'
                        title='糟糕，出现了一些问题'
                        subTitle='More likely there are some issues with the tool'
                    >
                        <div>
                            <Paragraph>
                                <Paragraph strong>发生了什么？</Paragraph>
                                <Paragraph>刚刚发生了程序错误</Paragraph>
                                <Collapse
                                    accordion
                                    defaultActiveKey={['errorMessage']}
                                    items={[{
                                        key: 'errorMessage',
                                        label: '异常详情',
                                        children: (
                                            <Text type='danger'>
                                                <TextArea
                                                    className='cvat-global-boundary-error-field'
                                                    autoSize
                                                    value={message}
                                                />
                                            </Text>
                                        ),
                                    }]}
                                />
                            </Paragraph>

                            <Paragraph>
                                <Text strong>我该怎么做？</Text>
                            </Paragraph>
                            <ul>
                                <li>
                                    通知管理员，或直接在<a href={config.GITHUB_URL}> GitHub 上提交此问题。</a>
                                    同时请提供：<ul>
                                        <li>上方完整错误消息</li>
                                        <li>复现该问题的步骤</li>
                                        <li>你的操作系统和浏览器版本</li>
                                        <li>CVAT 版本</li>
                                        <ul>
                                            <li>
                                                <Text strong>服务器：</Text>
                                                {serverVersion}
                                            </li>
                                            <li>
                                                <Text strong>界面：</Text>
                                                {uiVersion}
                                            </li>
                                        </ul>
                                    </ul>
                                </li>
                                {job ? (
                                    <li>
                                        按{/* eslint-disable-next-line */}
                                        <a onClick={restoreGlobalState}> 这里</a>
                                        如果希望 CVAT 尝试恢复你的标注进度，或{/* eslint-disable-next-line */}
                                        <a onClick={() => window.location.reload()}> 刷新</a>
                                        页面</li>
                                ) : (
                                    <li>
                                        {/* eslint-disable-next-line */}
                                        <a onClick={() => window.location.reload()}>更新</a>
                                        页面</li>
                                )}
                            </ul>
                        </div>
                    </Result>
                </div>
            );
        }

        const { children } = this.props;
        return children;
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(GlobalErrorBoundary);
