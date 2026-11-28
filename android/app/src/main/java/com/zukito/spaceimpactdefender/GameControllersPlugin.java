package com.zukito.spaceimpactdefender;

import android.content.Context;
import android.hardware.input.InputManager;
import android.os.Build;
import android.util.SparseArray;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GameControllers")
public class GameControllersPlugin extends Plugin implements InputManager.InputDeviceListener {
    private static final String STATE_EVENT = "controllerState";
    private static final int UP = 1 << 12;
    private static final int DOWN = 1 << 13;
    private static final int LEFT = 1 << 14;
    private static final int RIGHT = 1 << 15;
    private static final int TRIGGER = 1 << 7;

    private static class Pad {
        float x;
        float y;
        int keys;
        int axisButtons;
    }

    private final SparseArray<Pad> pads = new SparseArray<>();
    private InputManager inputManager;
    private boolean frameQueued;

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> {
            inputManager = (InputManager) getActivity().getSystemService(Context.INPUT_SERVICE);
            if (inputManager == null) return;
            inputManager.registerInputDeviceListener(this, null);
            for (int id : inputManager.getInputDeviceIds()) onInputDeviceAdded(id);
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (inputManager != null) inputManager.unregisterInputDeviceListener(this);
    }

    @PluginMethod
    public void getState(PluginCall call) {
        getActivity().runOnUiThread(() -> call.resolve(snapshot()));
    }

    private static boolean isController(InputDevice device) {
        if (device == null) return false;
        if (device.supportsSource(InputDevice.SOURCE_GAMEPAD) || device.supportsSource(InputDevice.SOURCE_JOYSTICK)) return true;
        return !device.isVirtual() && device.supportsSource(InputDevice.SOURCE_DPAD)
            && device.getKeyboardType() != InputDevice.KEYBOARD_TYPE_ALPHABETIC
            && (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || device.isExternal());
    }

    @Override
    public void onInputDeviceAdded(int id) {
        if (isController(inputManager.getInputDevice(id)) && pads.get(id) == null) {
            pads.put(id, new Pad());
            publish();
        }
    }

    @Override
    public void onInputDeviceChanged(int id) {
        InputDevice device = inputManager.getInputDevice(id);
        if (device == null) onInputDeviceRemoved(id);
        else if (isController(device)) onInputDeviceAdded(id);
    }

    @Override
    public void onInputDeviceRemoved(int id) {
        if (pads.get(id) == null) return;
        pads.remove(id);
        publish();
    }

    void resetInput() {
        for (int i = 0; i < pads.size(); i++) {
            final Pad pad = pads.valueAt(i);
            pad.x = pad.y = 0;
            pad.axisButtons = pad.keys = 0;
        }
        sendState(true);
    }

    @Override
    protected void handleOnPause() {
        getActivity().runOnUiThread(this::resetInput);
    }

    private Pad padFor(InputDevice device) {
        Pad pad = pads.get(device.getId());
        if (pad == null) {
            pad = new Pad();
            pads.put(device.getId(), pad);
            publish();
        }
        return pad;
    }

    boolean readMotion(MotionEvent event) {
        if (event.getActionMasked() != MotionEvent.ACTION_MOVE
            || !(event.isFromSource(InputDevice.SOURCE_JOYSTICK) || event.isFromSource(InputDevice.SOURCE_GAMEPAD))) return false;
        InputDevice device = event.getDevice();
        if (device == null) return false;
        Pad pad = padFor(device);
        float x = readStick(device, event, MotionEvent.AXIS_X);
        float y = readStick(device, event, MotionEvent.AXIS_Y);
        float hatX = event.getAxisValue(MotionEvent.AXIS_HAT_X);
        float hatY = event.getAxisValue(MotionEvent.AXIS_HAT_Y);
        int buttons = 0;
        if (hatX < -0.5f) buttons |= LEFT;
        if (hatX > 0.5f) buttons |= RIGHT;
        if (hatY < -0.5f) buttons |= UP;
        if (hatY > 0.5f) buttons |= DOWN;
        if (Math.max(event.getAxisValue(MotionEvent.AXIS_RTRIGGER), event.getAxisValue(MotionEvent.AXIS_GAS)) > 0.55f) {
            buttons |= TRIGGER;
        }
        if (pad.x != x || pad.y != y || pad.axisButtons != buttons) {
            boolean changedButtons = pad.axisButtons != buttons;
            pad.x = x;
            pad.y = y;
            pad.axisButtons = buttons;
            if (changedButtons) sendState(false);
            else publish();
        }
        return true;
    }

    private static float readStick(InputDevice device, MotionEvent event, int axis) {
        InputDevice.MotionRange range = device.getMotionRange(axis, event.getSource());
        float value = event.getAxisValue(axis);
        return range != null && Math.abs(value) <= range.getFlat() ? 0 : value;
    }

    boolean readKey(KeyEvent event) {
        int action = event.getAction();
        if (action != KeyEvent.ACTION_DOWN && action != KeyEvent.ACTION_UP) return false;
        InputDevice device = event.getDevice();
        if (device == null) return false;
        int key = event.getKeyCode();
        if (!isController(device) && pads.get(device.getId()) == null && !KeyEvent.isGamepadButton(key)
            && !event.isFromSource(InputDevice.SOURCE_GAMEPAD)) return false;
        int button;
        switch (key) {
            case KeyEvent.KEYCODE_BUTTON_A:
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER: button = 1; break;
            case KeyEvent.KEYCODE_BUTTON_B:
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE: button = 1 << 1; break;
            case KeyEvent.KEYCODE_BUTTON_R1: button = 1 << 5; break;
            case KeyEvent.KEYCODE_BUTTON_R2: button = TRIGGER; break;
            case KeyEvent.KEYCODE_BUTTON_START: button = 1 << 9; break;
            case KeyEvent.KEYCODE_DPAD_UP: button = UP; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: button = DOWN; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: button = LEFT; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: button = RIGHT; break;
            default: return false;
        }
        Pad pad = padFor(device);
        int next = action == KeyEvent.ACTION_DOWN ? pad.keys | button : pad.keys & ~button;
        if (next != pad.keys) {
            pad.keys = next;
            // Send button changes promptly when the game is polling input.
            sendState(false);
        }
        return true;
    }

    private void publish() {
        if (frameQueued) return;
        frameQueued = true;
        getActivity().getWindow().getDecorView().postOnAnimation(() -> {
            frameQueued = false;
            sendState(false);
        });
    }

    private void sendState(boolean reset) {
        JSObject state = snapshot();
        if (reset) state.put("reset", true);
        // Capacitor registers and removes listeners on its plugin handler.
        getBridge().execute(() -> notifyListeners(STATE_EVENT, state));
    }

    private JSObject snapshot() {
        JSArray controllers = new JSArray();
        for (int i = 0; i < pads.size(); i++) {
            Pad pad = pads.valueAt(i);
            JSObject state = new JSObject();
            state.put("id", "android:" + pads.keyAt(i));
            state.put("x", (double) pad.x);
            state.put("y", (double) pad.y);
            state.put("buttons", pad.keys | pad.axisButtons);
            controllers.put(state);
        }
        JSObject state = new JSObject();
        state.put("controllers", controllers);
        return state;
    }
}
