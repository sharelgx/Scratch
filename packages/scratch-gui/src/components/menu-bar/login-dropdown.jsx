/*
NOTE: this file only temporarily resides in scratch-gui.
Nearly identical code appears in scratch-www, and the two should
eventually be consolidated.
*/

import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl} from 'react-intl';
import bindAll from 'lodash.bindall';

import MenuBarMenu from './menu-bar-menu.jsx';

import styles from './login-dropdown.css';

// these are here as a hack to get them translated, so that equivalent messages will be translated
// when passed in from www via gui's renderLogin() function
const LoginDropdownMessages = defineMessages({
    username: {
        defaultMessage: 'Username',
        description: 'Label for login username input',
        id: 'general.username'
    },
    password: {
        defaultMessage: 'Password',
        description: 'Label for login password input',
        id: 'general.password'
    },
    signin: {
        defaultMessage: 'Sign in',
        description: 'Button text for user to sign in',
        id: 'general.signIn'
    },
    needhelp: {
        defaultMessage: 'Need Help?',
        description: 'Button text for user to indicate that they need help',
        id: 'login.needHelp'
    },
    validationRequired: {
        defaultMessage: 'This field is required',
        description: 'Message to tell user they must enter text in a form field',
        id: 'form.validationRequired'
    }
});


class LoginDropdown extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleSubmit',
            'handleUsernameChange',
            'handlePasswordChange'
        ]);
        this.state = {
            username: '',
            password: '',
            error: null,
            isLoading: false
        };
    }

    handleUsernameChange (e) {
        this.setState({username: e.target.value, error: null});
    }

    handlePasswordChange (e) {
        this.setState({password: e.target.value, error: null});
    }

    async handleSubmit (e) {
        e.preventDefault();
        
        const {username, password} = this.state;
        
        if (!username || !password) {
            this.setState({
                error: this.props.intl.formatMessage(LoginDropdownMessages.validationRequired)
            });
            return;
        }

        this.setState({isLoading: true, error: null});

        try {
            // 调用后端登录 API
            const response = await fetch('http://localhost:8086/api/login/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok && data.error === null) {
                // 登录成功
                console.log('✅ 登录成功！');
                this.setState({isLoading: false});
                
                // 关闭下拉框
                if (this.props.onClose) {
                    this.props.onClose();
                }
                
                // 通知父窗口更新用户信息（不刷新整个页面）
                if (window.parent && window.parent !== window) {
                    console.log('📨 通知父窗口更新用户信息...');
                    
                    // 方式1：调用父窗口的刷新函数（如果存在）
                    if (window.parent.refreshUserInfo && typeof window.parent.refreshUserInfo === 'function') {
                        window.parent.refreshUserInfo();
                    } else {
                        // 方式2：发送 postMessage
                        window.parent.postMessage({
                            type: 'SCRATCH_LOGIN_SUCCESS'
                        }, '*');
                        
                        // 方式3：等待 2 秒后刷新父窗口（确保 Cookie 已保存）
                        setTimeout(() => {
                            window.parent.location.reload();
                        }, 1000);
                    }
                } else {
                    // 否则刷新当前页面
                    window.location.reload();
                }
            } else {
                // 登录失败
                this.setState({
                    isLoading: false,
                    error: data.data || 'Login failed. Please check your credentials.'
                });
            }
        } catch (error) {
            this.setState({
                isLoading: false,
                error: 'Network error. Please try again.'
            });
        }
    }

    render () {
        const {
            className,
            isOpen,
            isRtl,
            onClose
        } = this.props;

        const {username, password, error, isLoading} = this.state;

        return (
            <MenuBarMenu
                className={className}
                open={isOpen}
                place={isRtl ? 'right' : 'left'}
                onRequestClose={onClose}
            >
                <div className={classNames(styles.login)}>
                    <form
                        className={styles.loginForm}
                        onSubmit={this.handleSubmit}
                    >
                        <div className={styles.loginTitle}>
                            <FormattedMessage
                                defaultMessage="Sign in to MetaSeekOJ"
                                description="Title for login form"
                                id="login.signInTitle"
                            />
                        </div>
                        
                        <div className={styles.formGroup}>
                            <label
                                className={styles.label}
                                htmlFor="username"
                            >
                                <FormattedMessage {...LoginDropdownMessages.username} />
                            </label>
                            <input
                                className={styles.input}
                                disabled={isLoading}
                                id="username"
                                name="username"
                                type="text"
                                value={username}
                                onChange={this.handleUsernameChange}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label
                                className={styles.label}
                                htmlFor="password"
                            >
                                <FormattedMessage {...LoginDropdownMessages.password} />
                            </label>
                            <input
                                className={styles.input}
                                disabled={isLoading}
                                id="password"
                                name="password"
                                type="password"
                                value={password}
                                onChange={this.handlePasswordChange}
                            />
                        </div>

                        {error && (
                            <div className={styles.error}>
                                {error}
                            </div>
                        )}

                        <button
                            className={styles.submitButton}
                            disabled={isLoading}
                            type="submit"
                        >
                            {isLoading ? (
                                <FormattedMessage
                                    defaultMessage="Signing in..."
                                    description="Button text while logging in"
                                    id="login.signingIn"
                                />
                            ) : (
                                <FormattedMessage {...LoginDropdownMessages.signin} />
                            )}
                        </button>
                    </form>
                </div>
            </MenuBarMenu>
        );
    }
}

LoginDropdown.propTypes = {
    className: PropTypes.string,
    intl: PropTypes.object.isRequired,
    isOpen: PropTypes.bool,
    isRtl: PropTypes.bool,
    onClose: PropTypes.func,
    renderLogin: PropTypes.func
};

export default injectIntl(LoginDropdown);
