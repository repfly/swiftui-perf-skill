# Perf test template (XCUITest)

Use this only if `rules.testException` allows `XCTestCase` perf tests, or after the user approves it. Record the approval in `findings.md`.

- Perf tests use `XCTestCase` and `measure(metrics:)`, because Swift Testing has no `measure`.
- Run them with `xcodebuild test -only-testing:<perf target>`, serially, on the one simulator or the device, after the user logs in.

## Target

- A new UI test target `<App>PerfTests`, host app from `apps[]`. Create it in Xcode, not by hand in `project.pbxproj`.
- A perf scheme or test plan that builds the profile configuration, with "Debug executable" off and no diagnostics.
- Launch argument `-PerfMarkers YES` only while the marker patch is applied.

## Tests

```swift
import XCTest

final class LaunchPerfTests: XCTestCase {

    func testColdLaunch() {
        let options = XCTMeasureOptions()
        options.iterationCount = 5
        measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)], options: options) {
            XCUIApplication().launch()
        }
    }
}

final class ScreenOpenPerfTests: XCTestCase {

    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    func testOpenProfile() {
        let options = XCTMeasureOptions()
        options.iterationCount = 10
        options.invocationOptions = [.manuallyStop]
        measure(metrics: [XCTClockMetric(), XCTOSSignpostMetric.navigationTransitionMetric], options: options) {
            app.buttons["tab.profile"].tap()
            XCTAssertTrue(app.staticTexts["profile.title"].waitForExistence(timeout: 5))
            stopMeasuring()
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
    }
}

final class ScrollPerfTests: XCTestCase {

    func testListScroll() {
        let app = XCUIApplication()
        app.launch()
        let list = app.scrollViews.firstMatch
        XCTAssertTrue(list.waitForExistence(timeout: 5))
        let options = XCTMeasureOptions()
        options.invocationOptions = [.manuallyStop]
        measure(metrics: [XCTOSSignpostMetric.scrollingAndDecelerationMetric], options: options) {
            list.swipeUp(velocity: .fast)
            stopMeasuring()
            list.swipeDown(velocity: .fast)
        }
    }
}
```

- Replace the accessibility identifiers with real ones. Adding an identifier to a view is an app change; ask first.
- `XCTHitchMetric` needs iOS 26. Use it in an `if #available(iOS 26, *)` branch.
- With the marker patch applied, add `XCTOSSignpostMetric(subsystem: "<markers.subsystem>", category: "PointsOfInterest", name: "ScreenOpen")`. Without the patch the interval does not exist; use `XCTClockMetric` (tap → element exists).
- `navigationTransitionMetric` with a custom navigation stack is not verified. If it reports nothing, use `XCTClockMetric` only.

## Run

```
xcodebuild test -workspace <workspace> -scheme <PerfScheme> \
  -destination 'id=<udid>' -only-testing:<App>PerfTests -resultBundlePath runs/perf-<n>.xcresult
xcrun xcresulttool export metrics --path runs/perf-<n>.xcresult
```

- Baselines are per host and per device. `xcodebuild` cannot record baselines; compare the exported metrics between runs.

## Action plan output

```
### Perf tests (<scheme>, <target>, <build>)
| Test | Metric | p50 | sd | Baseline | Delta |
|---|---|---|---|---|---|
Test exception: <rules.testException | user approval, date | not given; template only>
```
