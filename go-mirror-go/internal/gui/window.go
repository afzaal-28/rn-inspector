package gui

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

type MirrorWindow struct {
	cmd       *exec.Cmd
	ffplayCmd *exec.Cmd
	title     string
}

func NewMirrorWindow(title string) *MirrorWindow {
	return &MirrorWindow{
		title: title,
	}
}

func (w *MirrorWindow) Start(cmd *exec.Cmd) error {
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	ffmpegPath, err := findBundledTool("ffmpeg")
	if err != nil {
		return err
	}

	ffplayPath, err := findBundledTool("ffplay")
	if err != nil {
		return err
	}

	ffmpegCmd := exec.Command(ffmpegPath,
		"-f", "h264",
		"-i", "pipe:0",
		"-c:v", "copy",
		"-bsf:v", "h264_metadata=aud=insert:repeat-headers=1",
		"-muxdelay", "0",
		"-muxpreload", "0",
		"-f", "mpegts",
		"-",
	)
	ffmpegCmd.Stdin = stdout

	ffmpegOut, err := ffmpegCmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create ffmpeg stdout pipe: %w", err)
	}

	w.ffplayCmd = exec.Command(ffplayPath,
		"-window_title", w.title,
		"-fflags", "nobuffer",
		"-flags", "low_delay",
		"-framedrop",
		"-probesize", "32",
		"-analyzeduration", "0",
		"-sync", "ext",
		"-",
	)
	w.ffplayCmd.Stdin = ffmpegOut
	w.ffplayCmd.Stderr = os.Stderr
	if runtime.GOOS == "linux" {
		w.ffplayCmd.Env = append(os.Environ(), "SDL_VIDEODRIVER=x11")
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start mirror command: %w", err)
	}

	go io.Copy(os.Stderr, stderr)

	if err := ffmpegCmd.Start(); err != nil {
		cmd.Process.Kill()
		return fmt.Errorf("failed to start ffmpeg: %w", err)
	}

	if err := w.ffplayCmd.Start(); err != nil {
		cmd.Process.Kill()
		ffmpegCmd.Process.Kill()
		return fmt.Errorf("failed to start ffplay (is it installed?): %w", err)
	}

	w.cmd = cmd

	w.ffplayCmd.Wait()

	if cmd.Process != nil {
		cmd.Process.Kill()
	}
	if ffmpegCmd.Process != nil {
		ffmpegCmd.Process.Kill()
	}
	return nil
}

func (w *MirrorWindow) Stop() {
	if w.cmd != nil && w.cmd.Process != nil {
		w.cmd.Process.Kill()
	}
	if w.ffplayCmd != nil && w.ffplayCmd.Process != nil {
		w.ffplayCmd.Process.Kill()
	}
}

func findBundledTool(tool string) (string, error) {
	if path, err := exec.LookPath(tool); err == nil {
		return path, nil
	}

	currentExe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("failed to locate %s: %w", tool, err)
	}

	baseDir := filepath.Dir(currentExe)
	ext := ""
	if runtime.GOOS == "windows" {
		ext = ".exe"
	}
	name := tool + ext
	candidates := []string{
		filepath.Join(baseDir, name),
		filepath.Join(baseDir, "ffmpeg", name),
		filepath.Join(baseDir, "ffmpeg", "bin", name),
		filepath.Join(baseDir, "bin", name),
	}

	for _, candidate := range candidates {
		info, statErr := os.Stat(candidate)
		if statErr == nil && !info.IsDir() {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("failed to locate %s: not found in PATH or bundled next to the executable", tool)
}
