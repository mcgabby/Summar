tell application "Calendar"
    set matchingEvents to {}
    set theStart to current date
    set theEnd to theStart + 2 * 24 * hours
    repeat with aCal in calendars
        set theEvents to (every event of aCal whose start date ≥ theStart and start date ≤ theEnd)
        repeat with e in theEvents
            ignoring case
                if ((summary of e as string) contains "zoom") or ((description of e as string) contains "zoom") or ((location of e as string) contains "zoom") then
                    set eventInfo to (summary of e as string) & "||" & (start date of e as string) & "||" & (end date of e as string) & "||" & (description of e as string) & "||" & (location of e as string)
                    set matchingEvents to matchingEvents & {eventInfo}
                end if
            end ignoring
        end repeat
    end repeat
    return matchingEvents
end tell