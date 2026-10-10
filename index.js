/**
 * @format
 */

import './src/services/net/install';
import { AppRegistry } from 'react-native';
import { startBubbleChat } from './src/services/school/bubbleChat';
import App from './App';
import { name as appName } from './app.json';

// Listen for questions from the floating bubble, even when no screen is open.
startBubbleChat();

AppRegistry.registerComponent(appName, () => App);
