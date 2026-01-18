@echo off
setlocal

set APP_BASE_NAME=%~n0
set APP_HOME=%~dp0

set GRADLE_WRAPPER_JAR=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar
if not exist "%GRADLE_WRAPPER_JAR%" (
  echo Gradle wrapper JAR not found. Run "gradle wrapper" or use Android Studio to generate it.
  exit /b 1
)

if defined JAVA_HOME (
  set JAVA_EXEC=%JAVA_HOME%\bin\java.exe
) else (
  set JAVA_EXEC=java.exe
)

"%JAVA_EXEC%" -Dorg.gradle.appname=%APP_BASE_NAME% -classpath "%GRADLE_WRAPPER_JAR%" org.gradle.wrapper.GradleWrapperMain %*
