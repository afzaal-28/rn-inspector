package gui

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"

	"go-mirror/internal/android"
	"go-mirror/internal/ios"
)

type DeviceInfo struct {
	ID       string
	Name     string
	Platform string
}

func ShowDeviceSelector() (*DeviceInfo, error) {
	devices, err := discoverDevices()
	if err != nil {
		return nil, err
	}

	if len(devices) == 0 {
		return nil, fmt.Errorf("no devices found")
	}

	fmt.Println("\n╔════════════════════════════════════════════════════════╗")
	fmt.Println("║           Select a device to mirror                    ║")
	fmt.Println("╚════════════════════════════════════════════════════════╝")
	fmt.Println()

	for i, device := range devices {
		platformIcon := "📱"
		if device.Platform == "ios" {
			platformIcon = "🍎"
		}
		fmt.Printf("  [%d] %s %s - %s\n", i+1, platformIcon, device.Name, device.Platform)
	}

	fmt.Println()
	fmt.Print("Enter device number (or 'q' to quit): ")

	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return nil, err
	}

	input = strings.TrimSpace(input)

	if input == "q" || input == "Q" {
		return nil, fmt.Errorf("cancelled by user")
	}

	selection, err := strconv.Atoi(input)
	if err != nil || selection < 1 || selection > len(devices) {
		return nil, fmt.Errorf("invalid selection")
	}

	return &devices[selection-1], nil
}

func discoverDevices() ([]DeviceInfo, error) {
	var devices []DeviceInfo

	androidDevices, err := android.ListDevices()
	if err == nil {
		for _, device := range androidDevices {
			if device.Status == "device" {
				devices = append(devices, DeviceInfo{
					ID:       device.ID,
					Name:     device.ID,
					Platform: "android",
				})
			}
		}
	}

	iosSimulators, err := ios.ListSimulators()
	if err == nil {
		for _, sim := range iosSimulators {
			if sim.State == "Booted" {
				devices = append(devices, DeviceInfo{
					ID:       sim.UDID,
					Name:     sim.Name,
					Platform: "ios",
				})
			}
		}
	}

	return devices, nil
}
