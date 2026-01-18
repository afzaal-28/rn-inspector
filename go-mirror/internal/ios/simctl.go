package ios

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
)

type Simulator struct {
	UDID  string `json:"udid"`
	Name  string `json:"name"`
	State string `json:"state"`
}

type SimulatorList struct {
	Devices map[string][]Simulator `json:"devices"`
}

func CheckSimctl() error {
	if runtime.GOOS != "darwin" {
		return fmt.Errorf("iOS simulator mirroring is only available on macOS")
	}

	cmd := exec.Command("xcrun", "simctl", "help")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("xcrun simctl not found: %w (install Xcode)", err)
	}
	return nil
}

func ListSimulators() ([]Simulator, error) {
	cmd := exec.Command("xcrun", "simctl", "list", "devices", "-j")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to list simulators: %w", err)
	}

	var simList SimulatorList
	if err := json.Unmarshal(output, &simList); err != nil {
		return nil, fmt.Errorf("failed to parse simulator list: %w", err)
	}

	var simulators []Simulator
	for _, deviceList := range simList.Devices {
		simulators = append(simulators, deviceList...)
	}

	return simulators, nil
}

func GetBootedSimulator() (string, error) {
	simulators, err := ListSimulators()
	if err != nil {
		return "", err
	}

	for _, sim := range simulators {
		if sim.State == "Booted" {
			return sim.UDID, nil
		}
	}

	return "", fmt.Errorf("no booted simulator found")
}

func StartMirroring(udid string) (*exec.Cmd, error) {
	if udid == "" {
		bootedSim, err := GetBootedSimulator()
		if err != nil {
			return nil, err
		}
		udid = bootedSim
	}

	cmd := exec.Command("xcrun", "simctl", "io", udid, "recordVideo", "--codec=h264", "-")
	
	return cmd, nil
}
