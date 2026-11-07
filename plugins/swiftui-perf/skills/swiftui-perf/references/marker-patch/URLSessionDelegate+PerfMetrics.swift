import Foundation
import os

extension __DELEGATE_TYPE__ {

    private static let perfEnabled = UserDefaults.standard.bool(forKey: "PerfMarkers")
    private static let perfLogger = Logger(subsystem: "__SUBSYSTEM__", category: "net")

    __ACCESS__func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        guard Self.perfEnabled else { return }
        let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
        for transaction in metrics.transactionMetrics {
            let fields = [
                "task=\(task.taskIdentifier)",
                "method=\(transaction.request.httpMethod ?? "-")",
                "path=\(transaction.request.url?.path ?? "-")",
                "status=\((transaction.response as? HTTPURLResponse)?.statusCode ?? status)",
                "proto=\(transaction.networkProtocolName ?? "-")",
                "reused=\(transaction.isReusedConnection ? 1 : 0)",
                "cache=\(Self.perfFetchType(transaction.resourceFetchType))",
                "dns=\(Self.perfSpan(transaction.domainLookupStartDate, transaction.domainLookupEndDate))",
                "connect=\(Self.perfSpan(transaction.connectStartDate, transaction.secureConnectionStartDate ?? transaction.connectEndDate))",
                "tls=\(Self.perfSpan(transaction.secureConnectionStartDate, transaction.secureConnectionEndDate))",
                "ttfb=\(Self.perfSpan(transaction.requestEndDate, transaction.responseStartDate))",
                "download=\(Self.perfSpan(transaction.responseStartDate, transaction.responseEndDate))",
                "total=\(Self.perfSpan(transaction.fetchStartDate, transaction.responseEndDate))",
                "start=\(Self.perfEpoch(transaction.fetchStartDate))"
            ]
            let line = "PERF net " + fields.joined(separator: " ")
            Self.perfLogger.notice("\(line, privacy: .public)")
        }
    }

    private static func perfSpan(_ start: Date?, _ end: Date?) -> String {
        guard let start, let end else { return "-" }
        return String(format: "%.1f", end.timeIntervalSince(start) * 1000)
    }

    private static func perfEpoch(_ date: Date?) -> String {
        guard let date else { return "-" }
        return String(format: "%.1f", date.timeIntervalSince1970 * 1000)
    }

    private static func perfFetchType(_ type: URLSessionTaskMetrics.ResourceFetchType) -> String {
        switch type {
        case .networkLoad:
            return "network"
        case .localCache:
            return "localCache"
        case .serverPush:
            return "serverPush"
        default:
            return "unknown"
        }
    }
}
