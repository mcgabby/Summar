import EventKit
import Foundation

let eventStore = EKEventStore()
let now = Date()

// 명령줄 인자 파싱: --list-calendars가 있으면 캘린더 목록만 출력
var targetCalendars: Set<String> = []
if let fetchCalendarsArg = CommandLine.arguments.first(where: { $0.hasPrefix("--fetch-calendars=") }) {
    let value = fetchCalendarsArg.replacingOccurrences(of: "--fetch-calendars=", with: "")
    let names = value.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
    targetCalendars = Set(names)
}

// --search-date 인자로 특정 날짜 검색 (예: --search-date=2024-12-26)
var searchDate: Date? = nil
if let searchDateArg = CommandLine.arguments.first(where: { $0.hasPrefix("--search-date=") }) {
    let value = searchDateArg.replacingOccurrences(of: "--search-date=", with: "")
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = TimeZone.current  // 현재 시스템 시간대 사용 (KST)
    
    // 먼저 문자열을 로컬 시간대로 파싱
    if let parsedDate = formatter.date(from: value) {
        searchDate = parsedDate
    }
}

// 검색 범위 설정
let startDate: Date
let endDate: Date

if let searchDate = searchDate {
    // 특정 날짜가 지정된 경우: 해당 날짜만 검색 (0시부터 다음날 0시까지)
    startDate = Calendar.current.startOfDay(for: searchDate)
    endDate = Calendar.current.date(byAdding: .day, value: 1, to: startDate)!
} else {
    // 기본 동작: 현재 시간부터 내일까지
    var fetchDays = 1  // 기본값: 미래 1일
    
    // --fetch-days 인자 처리 (기존 호환성 유지)
    if let fetchDaysArg = CommandLine.arguments.first(where: { $0.hasPrefix("--fetch-days=") }) {
        let value = fetchDaysArg.replacingOccurrences(of: "--fetch-days=", with: "")
        if let days = Int(value) {
            fetchDays = days
        }
    }
    
    startDate = now
    endDate = Calendar.current.date(byAdding: .day, value: fetchDays, to: now)!
}


// macOS 14 이상에서는 requestFullAccessToEventsWithCompletion 사용
func requestCalendarAccess(completion: @escaping (Bool) -> Void) {
    if #available(macOS 14.0, *) {
        eventStore.requestFullAccessToEvents { granted, error in
            completion(granted && error == nil)
        }
    } else {
        eventStore.requestAccess(to: .event) { granted, error in
            completion(granted && error == nil)
        }
    }
}

// 명령줄 인자 파싱: --list-calendars가 있으면 캘린더 목록만 출력
if CommandLine.arguments.contains("--check-permission") {
    // 캘린더 권한 상태만 확인 및 요청
    requestCalendarAccess { granted in
        if granted {
            print("authorized")
            exit(0)
        } else {
            // 권한 거부 또는 미결정
            let status: String
            if #available(macOS 14.0, *) {
                switch EKEventStore.authorizationStatus(for: .event) {
                case .authorized:
                    status = "authorized"
                case .denied:
                    status = "denied"
                case .notDetermined:
                    status = "notDetermined"
                default:
                    status = "unknown"
                }
            } else {
                switch EKEventStore.authorizationStatus(for: .event) {
                case .authorized:
                    status = "authorized"
                case .denied:
                    status = "denied"
                case .notDetermined:
                    status = "notDetermined"
                default:
                    status = "unknown"
                }
            }
            print(status)
            exit(0)
        }
    }
    RunLoop.main.run()

} else if CommandLine.arguments.contains("--list-calendars") {
    requestCalendarAccess { granted in
        guard granted else {
            print("-1")
            exit(1)
        }
        let calendars = eventStore.calendars(for: .event)
        let calendarNames = calendars.map { $0.title }
        if let jsonData = try? JSONSerialization.data(withJSONObject: calendarNames, options: .prettyPrinted),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        } else {
            print("{\"error\": \"JSON 변환 오류\"}")
        }
        exit(0)
    }
    RunLoop.main.run()
} else if CommandLine.arguments.contains(where: { $0.hasPrefix("--fetch-calendars=") }) {
    // 특정 문자열("zoom")이 포함된 일정만 필터링
    func containsZoom(text: String?) -> Bool {
        guard let text = text?.lowercased() else { return false }
        return text.contains("zoom") || text.contains("https://zoom.us") || text.contains("zoommtg://")
    }

    // 시스템 로케일에 맞춘 날짜 포맷 변환
    func formatDateToLocalString(date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss ZZZ"
        formatter.locale = Locale.current
        formatter.timeZone = TimeZone.current
        return formatter.string(from: date)
    }

    // Zoom 링크를 추출하는 함수 (http로 시작하고 zoom.us 도메인이 포함된 URL 찾기)
    func extractZoomLink(from text: String?) -> String? {
        guard let text = text else { return nil }

        let pattern = #"https?://\S*zoom\.us\S*"#
        let regex = try? NSRegularExpression(pattern: pattern, options: [])

        if let match = regex?.firstMatch(in: text, options: [], range: NSRange(location: 0, length: text.utf16.count)) {
            if let range = Range(match.range, in: text) {
                return String(text[range])
            }
        }

        return nil
    }

    // 캘린더 접근 권한 요청 및 데이터 가져오기
    requestCalendarAccess { granted in
        guard granted else {
            print("-1")
            exit(1)
        }

        // ✅ 특정 캘린더 필터링
        let calendars = eventStore.calendars(for: .event).filter { targetCalendars.contains($0.title) }

        // 설정된 날짜 범위로 이벤트 검색
        let predicate = eventStore.predicateForEvents(withStart: startDate, end: endDate, calendars: calendars)
        let events = eventStore.events(matching: predicate)

        var filteredEvents: [[String: Any]] = []
        
        for event in events {
            let title = event.title ?? "제목 없음"
            let startDate = event.startDate ?? now
            let endDate = event.endDate ?? now
            let location = event.location ?? ""
            let notes = event.notes ?? ""
            
            // 내가 참석 수락한 이벤트인지 확인
            var myParticipantStatus = "unknown"
            
            if let eventAttendees = event.attendees {
                // 내 계정 정보 (현재 사용자)
                var foundMyself = false
                
                for attendee in eventAttendees {
                    // isCurrentUser로 확인하거나, organizer인 경우 확인
                    if attendee.isCurrentUser {
                        foundMyself = true
                        switch attendee.participantStatus {
                        case .accepted:
                            myParticipantStatus = "accepted"
                        case .declined:
                            myParticipantStatus = "declined"
                        case .tentative:
                            myParticipantStatus = "tentative"
                        case .pending:
                            myParticipantStatus = "pending"
                        default:
                            myParticipantStatus = "unknown"
                        }
                        break
                    }
                }
                
                // organizer가 나인 경우 (내가 생성한 이벤트)
                if !foundMyself {
                    if let organizer = event.organizer, organizer.isCurrentUser {
                        foundMyself = true
                        myParticipantStatus = "organizer"
                    }
                }
                
                // 참석자가 없거나 내가 찾아지지 않은 경우, 내 캘린더의 이벤트이므로 참석으로 간주
                if !foundMyself {
                    myParticipantStatus = "unknown"
                }
            }
            
            // 모든 이벤트를 리스트에 추가 (참석 상태와 관계없이)
            // 참석자 정보 추출 (주최자 포함)
            var attendees: [String] = []
            
            // 주최자 정보 먼저 추가
            if let organizer = event.organizer {
                var organizerInfo = ""
                if let name = organizer.name, !name.isEmpty {
                    organizerInfo = name
                    if let email = organizer.url.absoluteString.hasPrefix("mailto:") ? 
                        String(organizer.url.absoluteString.dropFirst("mailto:".count)) : nil,
                       !email.isEmpty {
                        organizerInfo += " <\(email)>"
                    }
                } else {
                    let urlString = organizer.url.absoluteString
                    if urlString.hasPrefix("mailto:") {
                        let email = String(urlString.dropFirst("mailto:".count))
                        if !email.isEmpty {
                            organizerInfo = email
                        }
                    }
                }
                if !organizerInfo.isEmpty {
                    attendees.append("👑 \(organizerInfo)") // 주최자 표시
                }
            }
            
            // 참석자 정보 추가
            if let eventAttendees = event.attendees {
                for attendee in eventAttendees {
                    var attendeeInfo = ""
                    if let name = attendee.name, !name.isEmpty {
                        attendeeInfo = name
                        let urlString = attendee.url.absoluteString
                        if urlString.hasPrefix("mailto:") {
                            let email = String(urlString.dropFirst("mailto:".count))
                            if !email.isEmpty {
                                attendeeInfo += " <\(email)>"
                            }
                        }
                    } else {
                        let urlString = attendee.url.absoluteString
                        if urlString.hasPrefix("mailto:") {
                            let email = String(urlString.dropFirst("mailto:".count))
                            if !email.isEmpty {
                                attendeeInfo = email
                            }
                        } else if !urlString.isEmpty {
                            attendeeInfo = urlString
                        }
                    }
                    if !attendeeInfo.isEmpty {
                        attendees.append(attendeeInfo)
                    }
                }
            }
            
            // Zoom 키워드가 포함된 일정만 필터링
            //if containsZoom(text: title) || containsZoom(text: location) || containsZoom(text: notes) {
                let zoomLink = extractZoomLink(from: notes) ?? extractZoomLink(from: location) ?? ""

                let eventData: [String: Any] = [
                    "title": title,
                    "start": formatDateToLocalString(date: startDate),
                    "end": formatDateToLocalString(date: endDate),
                    "description": notes,
                    "location": location,
                    "zoom_link": zoomLink,
                    "attendees": attendees,
                    "participant_status": myParticipantStatus
                ]
                filteredEvents.append(eventData)
            //}
        }

        // JSON 변환 후 출력
        if let jsonData = try? JSONSerialization.data(withJSONObject: filteredEvents, options: .prettyPrinted),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        } else {
            print("{\"error\": \"JSON 변환 오류\"}")
        }

        exit(0) // 정상적으로 실행 완료 후 종료
    }

    // 비동기 실행을 위해 약간의 대기 필요
    RunLoop.main.run()
} else {
    // 인자가 없으면 아무 동작도 하지 않고 종료
    print("No valid argument provided. Use --check-permission, --list-calendars or --fetch-calendars.")
    exit(0)
}
