import Alamofire
import Foundation
import os

final class PerfNetMonitor: EventMonitor {

    private static let perfEnabled = UserDefaults.standard.bool(forKey: "PerfMarkers")
    private static let perfLogger = Logger(subsystem: "__SUBSYSTEM__", category: "net")

    let queue = DispatchQueue(label: "perf.net.monitor")

    func request(_ request: Request, didGatherMetrics metrics: URLSessionTaskMetrics) {
        guard Self.perfEnabled else { return }
        let taskID = request.task?.taskIdentifier ?? -1
        let status = request.response?.statusCode ?? 0
        for transaction in metrics.transactionMetrics {
            let fields = [
                "task=\(taskID)",
                "method=\(transaction.request.httpMethod ?? "-")",
                "path=\(transaction.request.url?.path ?? "-")",
                "status=\((transaction.response as? HTTPURLResponse)?.statusCode ?? status)",
                "proto=\(transaction.networkProtocolName ?? "-")",
                "reused=\(transaction.isReusedConnection ? 1 : 0)",
                "cache=\(transaction.resourceFetchType == .localCache ? "localCache" : "network")",
                "dns=\(Self.span(transaction.domainLookupStartDate, transaction.domainLookupEndDate))",
                "connect=\(Self.span(transaction.connectStartDate, transaction.secureConnectionStartDate ?? transaction.connectEndDate))",
                "tls=\(Self.span(transaction.secureConnectionStartDate, transaction.secureConnectionEndDate))",
                "ttfb=\(Self.span(transaction.requestEndDate, transaction.responseStartDate))",
                "download=\(Self.span(transaction.responseStartDate, transaction.responseEndDate))",
                "total=\(Self.span(transaction.fetchStartDate, transaction.responseEndDate))",
                "start=\(Self.epoch(transaction.fetchStartDate))"
            ]
            let line = "PERF net " + fields.joined(separator: " ")
            Self.perfLogger.notice("\(line, privacy: .public)")
        }
    }

    private static func span(_ start: Date?, _ end: Date?) -> String {
        guard let start, let end else { return "-" }
        return String(format: "%.1f", end.timeIntervalSince(start) * 1000)
    }

    private static func epoch(_ date: Date?) -> String {
        guard let date else { return "-" }
        return String(format: "%.1f", date.timeIntervalSince1970 * 1000)
    }
}
