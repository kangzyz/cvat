// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React from 'react';
import i18n from 'i18n';

import Tabs, { TabsProps } from 'antd/lib/tabs';
import Input from 'antd/lib/input';
import { RcFile } from 'antd/lib/upload';

import LocalFiles from './local-files';
import RemoteBrowser, { RemoteFile } from './remote-browser';

export interface Files {
    local: File[];
    share: string[];
    remote: string[];
    cloudStorage: string[];
}

interface State {
    files: Files;
    active: 'local' | 'share' | 'remote';
}

interface Props {
    localFilesHint: string;
    onChangeActiveKey(key: string): void;
    onUploadLocalFiles(files: File[]): void;
    onUploadRemoteFiles(urls: string[]): void;
    onUploadShareFiles(files: RemoteFile[]): void;
}

export class FileManager extends React.PureComponent<Props, State> {
    public constructor(props: Props) {
        super(props);

        this.state = {
            files: {
                local: [],
                share: [],
                remote: [],
                cloudStorage: [],
            },
            active: 'local',
        };
    }

    private handleUploadSharedStorageFiles = (
        shareFiles: RemoteFile[],
    ): void => {
        const { files } = this.state;
        const { onUploadShareFiles } = this.props;
        this.setState({
            files: {
                ...files,
                share: shareFiles.map((item) => item.key),
            },
        });
        onUploadShareFiles(shareFiles);
    };

    public getFiles(): Files {
        const { active, files } = this.state;
        return {
            local: active === 'local' ? files.local : [],
            share: active === 'share' ? files.share : [],
            remote: active === 'remote' ? files.remote : [],
            cloudStorage: [],
        };
    }

    public selectShareFiles(shareFiles: string[]): void {
        const { onChangeActiveKey } = this.props;
        const { files } = this.state;

        onChangeActiveKey('share');
        this.setState({
            active: 'share',
            files: {
                ...files,
                local: [],
                share: shareFiles,
                remote: [],
                cloudStorage: [],
            },
        });
    }

    public reset(): void {
        this.setState({
            active: 'local',
            files: {
                local: [],
                share: [],
                remote: [],
                cloudStorage: [],
            },
        });
    }

    private renderLocalSelector(): NonNullable<TabsProps['items']>[0] {
        const { localFilesHint, onUploadLocalFiles } = this.props;
        const { files } = this.state;

        return {
            key: 'local',
            label: i18n.t('forms:options.myComputer'),
            className: 'cvat-file-manager-local-tab',
            children: (
                <LocalFiles
                    files={files.local}
                    hint={localFilesHint}
                    onUpload={(_: RcFile, newLocalFiles: RcFile[]): boolean => {
                        this.setState({
                            files: {
                                ...files,
                                local: newLocalFiles,
                            },
                        });
                        onUploadLocalFiles(newLocalFiles);
                        return false;
                    }}
                />
            ),
        };
    }

    private renderShareSelector(): NonNullable<TabsProps['items']>[0] {
        return {
            key: 'share',
            label: i18n.t('forms:options.connectedFileShare'),
            className: 'cvat-file-manager-share-tab',
            children: (
                <RemoteBrowser
                    resource='share'
                    onSelectFiles={this.handleUploadSharedStorageFiles}
                />
            ),
        };
    }

    private renderRemoteSelector(): NonNullable<TabsProps['items']>[0] {
        const { onUploadRemoteFiles } = this.props;
        const { files } = this.state;

        return {
            key: 'remote',
            label: i18n.t('forms:options.remoteSources'),
            className: 'cvat-file-manager-remote-tab',
            children: (
                <Input.TextArea
                    className='cvat-file-selector-remote'
                    placeholder={i18n.t('forms:placeholders.enterUrlPerLine')}
                    rows={6}
                    value={[...files.remote].join('\n')}
                    onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => {
                        const urls = event.target.value.split('\n');
                        this.setState({
                            files: {
                                ...files,
                                remote: urls,
                            },
                        });
                        onUploadRemoteFiles(urls.filter(Boolean));
                    }}
                />
            ),
        };
    }

    public render(): JSX.Element {
        const { onChangeActiveKey } = this.props;
        const { active } = this.state;

        return (
            <Tabs
                type='card'
                activeKey={active}
                tabBarGutter={5}
                onChange={(activeKey: string): void => {
                    onChangeActiveKey(activeKey);
                    this.setState({
                        active: activeKey as State['active'],
                    });
                }}
                items={[
                    this.renderLocalSelector(),
                    this.renderShareSelector(),
                    this.renderRemoteSelector(),
                ]}
            />
        );
    }
}

export default FileManager;
