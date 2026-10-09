import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  NavigationContainer,
  NavigationIndependentTree,
  DarkTheme,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bot, Gamepad2, House, Layers } from 'lucide-react-native';
import { colors, ui } from '../app/theme';
import { Button } from '../components/Button';
import { Gradient } from '../components/Gradient';

/**
 * Part A device check for the UI libraries the redesign uses: react-navigation
 * (native stack + bottom tabs, on react-native-screens), lucide icons and SVG
 * gradients. If this screen works on a phone, those native modules are linked.
 */
type Stack = { First: undefined; Second: undefined };
const S = createNativeStackNavigator<Stack>();
const T = createBottomTabNavigator();

function First({ navigation }: NativeStackScreenProps<Stack, 'First'>) {
  return (
    <View style={ui.content}>
      <Text style={ui.text}>Native stack: screen 1</Text>
      <Button
        title="Push screen 2"
        onPress={() => navigation.navigate('Second')}
      />
    </View>
  );
}

function Second() {
  return (
    <View style={ui.content}>
      <Text style={ui.text}>
        Native stack: screen 2. Use the back arrow or Android back.
      </Text>
    </View>
  );
}

function StackTab() {
  return (
    <S.Navigator>
      <S.Screen name="First" component={First} />
      <S.Screen name="Second" component={Second} />
    </S.Navigator>
  );
}

const houseIcon = ({ color }: { color: string }) => (
  <House color={color} size={20} />
);
const botIcon = ({ color }: { color: string }) => (
  <Bot color={color} size={20} />
);

function OtherTab() {
  return (
    <View style={ui.content}>
      <Text style={ui.text}>Bottom tabs work.</Text>
    </View>
  );
}

export function UiCheckScreen({ onBack }: { onBack(): void }) {
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Text style={ui.title}>UI libraries check</Text>

      <Text style={ui.h2}>1. SVG gradient</Text>
      <Gradient
        colors={['#1FC8A6', '#3D7BFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={ui.card}
      >
        <Text style={ui.text}>Teal → blue, diagonal</Text>
      </Gradient>

      <Text style={ui.h2}>2. Icons (lucide)</Text>
      <View style={[ui.card, ui.row]}>
        <House color={colors.accent} size={28} />
        <Layers color={colors.accent} size={28} />
        <Gamepad2 color={colors.accent} size={28} />
        <Bot color={colors.accent} size={28} />
      </View>

      <Text style={ui.h2}>3. Navigation (tabs + native stack)</Text>
      <View style={[ui.card, styles.navBox]}>
        <NavigationIndependentTree>
          <NavigationContainer theme={DarkTheme}>
            <T.Navigator screenOptions={{ headerShown: false }}>
              <T.Screen
                name="Stack"
                component={StackTab}
                options={{ tabBarIcon: houseIcon }}
              />
              <T.Screen
                name="Other"
                component={OtherTab}
                options={{ tabBarIcon: botIcon }}
              />
            </T.Navigator>
          </NavigationContainer>
        </NavigationIndependentTree>
      </View>

      <Button title="Back" onPress={onBack} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  navBox: { height: 320, padding: 0, overflow: 'hidden' },
});
