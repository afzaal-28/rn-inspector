package android

import (
	"fmt"
	"os/exec"
	"strings"
)

type Device struct {
	ID     string
	Status string
}

func ListDevices() ([]Device, error) {
	cmd := exec.Command("adb", "devices")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to list devices: %w", err)
	}

	lines := strings.Split(string(output), "\n")
	var devices []Device

	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) >= 2 {
			devices = append(devices, Device{
				ID:     parts[0],
				Status: parts[1],
			})
		}
	}

	return devices, nil
}

func GetDefaultDevice() (string, error) {
	devices, err := ListDevices()
	if err != nil {
		return "", err
	}

	if len(devices) == 0 {
		return "", fmt.Errorf("no devices found")
	}

	for _, device := range devices {
		if device.Status == "device" {
			return device.ID, nil
		}
	}

	return "", fmt.Errorf("no online devices found")
}

func StartMirroring(deviceID string) (*exec.Cmd, error) {
	if deviceID == "" {
		defaultDevice, err := GetDefaultDevice()
		if err != nil {
			return nil, err
		}
		deviceID = defaultDevice
	}

	cmd := exec.Command("adb", "-s", deviceID, "exec-out", "sh", "-c",
		"screenrecord --output-format=h264 --bit-rate 8000000 --time-limit 0 -")
	return cmd, nil
}

func CheckADB() error {
	cmd := exec.Command("adb", "version")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("adb not found: %w (install Android Platform Tools)", err)
	}
	return nil
}
