package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"

	"go-mirror/internal/android"
	"go-mirror/internal/gui"
	"go-mirror/internal/ios"
	"go-mirror/internal/stream"
)

const (
	version = "0.1.0"
)

func main() {
	// Check for global flags first
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "version", "--version", "-v":
			fmt.Printf("go-mirror version %s\n", version)
			return
		case "help", "--help", "-h":
			printUsage()
			return
		}
	}

	// If no arguments or starts with flag, run in GUI mode
	if len(os.Args) < 2 || os.Args[1][0] == '-' {
		runGUIMode()
		return
	}

	command := os.Args[1]

	switch command {
	case "android":
		handleAndroid()
	case "ios":
		handleIOS()
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", command)
		printUsage()
		os.Exit(1)
	}
}

func runGUIMode() {
	fmt.Println("Starting go-mirror in GUI mode...")
	fmt.Println("Scanning for devices...")

	// Show device selector
	device, err := gui.ShowDeviceSelector()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Selected device: %s (%s)\n", device.Name, device.Platform)

	// Start mirroring based on platform
	var cmd *exec.Cmd
	var cmdErr error

	if device.Platform == "android" {
		cmd, cmdErr = android.StartMirroring(device.ID)
	} else if device.Platform == "ios" {
		cmd, cmdErr = ios.StartMirroring(device.ID)
	} else {
		fmt.Fprintf(os.Stderr, "Unknown platform: %s\n", device.Platform)
		os.Exit(1)
	}

	if cmdErr != nil {
		fmt.Fprintf(os.Stderr, "Error starting mirroring: %v\n", cmdErr)
		os.Exit(1)
	}

	// Create and show mirror window
	window := gui.NewMirrorWindow(fmt.Sprintf("%s - %s", device.Platform, device.Name))
	if err := window.Start(cmd); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func handleAndroid() {
	fs := flag.NewFlagSet("android", flag.ExitOnError)
	deviceID := fs.String("device", "", "Specific device ID (default: first available)")
	output := fs.String("output", "", "Output file (default: stdout)")
	listDevices := fs.Bool("list", false, "List available devices")
	headless := fs.Bool("headless", false, "Run in headless mode (stream to stdout)")

	fs.Parse(os.Args[2:])

	if *listDevices {
		devices, err := android.ListDevices()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error listing devices: %v\n", err)
			os.Exit(1)
		}

		fmt.Println("Available Android devices:")
		for _, device := range devices {
			fmt.Printf("  %s (%s)\n", device.ID, device.Status)
		}
		return
	}

	if err := android.CheckADB(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	cmd, err := android.StartMirroring(*deviceID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error starting Android mirroring: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "Starting Android screen mirroring...\n")

	if *output != "" {
		if err := stream.StreamToFile(cmd, *output); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Fprintf(os.Stderr, "Recording saved to %s\n", *output)
	} else if *headless {
		if err := stream.StreamToStdout(cmd); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	} else {
		// GUI mode with window
		deviceName := *deviceID
		if deviceName == "" {
			deviceName, _ = android.GetDefaultDevice()
		}
		window := gui.NewMirrorWindow(fmt.Sprintf("Android Mirror - %s", deviceName))
		if err := window.Start(cmd); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	}
}

func handleIOS() {
	fs := flag.NewFlagSet("ios", flag.ExitOnError)
	simulator := fs.Bool("simulator", true, "Use iOS simulator (default: true)")
	udid := fs.String("udid", "", "Specific simulator UDID (default: booted simulator)")
	output := fs.String("output", "", "Output file (default: stdout)")
	listSims := fs.Bool("list", false, "List available simulators")
	headless := fs.Bool("headless", false, "Run in headless mode (stream to stdout)")

	fs.Parse(os.Args[2:])

	if err := ios.CheckSimctl(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	if *listSims {
		simulators, err := ios.ListSimulators()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error listing simulators: %v\n", err)
			os.Exit(1)
		}

		fmt.Println("Available iOS simulators:")
		for _, sim := range simulators {
			fmt.Printf("  %s - %s (%s)\n", sim.UDID, sim.Name, sim.State)
		}
		return
	}

	if !*simulator {
		fmt.Fprintf(os.Stderr, "Real device mirroring is not yet implemented\n")
		os.Exit(1)
	}

	cmd, err := ios.StartMirroring(*udid)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error starting iOS mirroring: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "Starting iOS simulator screen mirroring...\n")

	if *output != "" {
		if err := stream.StreamToFile(cmd, *output); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Fprintf(os.Stderr, "Recording saved to %s\n", *output)
	} else if *headless {
		if err := stream.StreamToStdout(cmd); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	} else {
		// GUI mode with window
		simName := *udid
		if simName == "" {
			simName, _ = ios.GetBootedSimulator()
		}
		window := gui.NewMirrorWindow(fmt.Sprintf("iOS Mirror - %s", simName))
		if err := window.Start(cmd); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	}
}

func printUsage() {
	fmt.Println(`go-mirror - Cross-platform screen mirroring for Android and iOS

USAGE:
  go-mirror                    # GUI mode (default) - interactive device selection
  go-mirror <command> [options]

MODES:
  GUI Mode (default):
    - Run without arguments to launch interactive device selector
    - Select device from list and mirror in a window
    - Uses ffplay for video rendering
  
  Headless Mode:
    - Use --headless flag to stream video to stdout
    - Useful for piping to other applications or scripts
    - No GUI window, pure streaming output

COMMANDS:
  android              Mirror Android device screen
  ios                  Mirror iOS simulator/device screen
  version              Show version information
  help                 Show this help message

ANDROID OPTIONS:
  --device <id>        Specific device ID (default: first available)
  --output <file>      Save to file instead of stdout
  --headless           Run in headless mode (stream to stdout)
  --list               List available devices

IOS OPTIONS:
  --simulator          Use iOS simulator (default: true)
  --udid <id>          Specific simulator UDID (default: booted)
  --output <file>      Save to file instead of stdout
  --headless           Run in headless mode (stream to stdout)
  --list               List available simulators

EXAMPLES:
  # GUI mode - interactive device selection
  go-mirror

  # Headless mode - pipe Android device to ffplay
  go-mirror android --headless | ffplay -

  # GUI mode - specific Android device in window
  go-mirror android --device emulator-5554

  # Headless mode - pipe to another application
  go-mirror android --headless | your-app

  # List Android devices
  go-mirror android --list

  # GUI mode - iOS simulator in window
  go-mirror ios --simulator

  # Headless mode - iOS simulator to stdout
  go-mirror ios --simulator --headless | ffplay -

  # Save iOS recording to file
  go-mirror ios --simulator --output recording.h264

  # List iOS simulators
  go-mirror ios --list

REQUIREMENTS:
  - Android: adb (Android Platform Tools)
  - iOS: Xcode + xcrun (macOS only)
  - GUI Mode: ffplay (from ffmpeg)
  - Headless Mode: No additional requirements

For more information, visit: https://github.com/afzaal-28/go-mirror`)
}

