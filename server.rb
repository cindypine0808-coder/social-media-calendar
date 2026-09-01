#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "net/http"
require "uri"
require "webrick"

ROOT = File.expand_path(__dir__)
PORT = Integer(ENV.fetch("PORT", "4173"))
NOTION_VERSION = "2022-06-28"
DEFAULT_DB = "3b8fa165da7180b69c19e12a8fa733fd"

def load_env
  path = File.join(ROOT, ".env")
  return unless File.exist?(path)

  File.foreach(path) do |line|
    next if line.strip.empty? || line.start_with?("#")

    key, value = line.split("=", 2)
    next unless key && value

    ENV[key.strip] ||= value.strip
  end
end

def notion_id(raw)
  compact = raw.to_s.gsub("-", "")
  format(
    "%s-%s-%s-%s-%s",
    compact[0, 8],
    compact[8, 4],
    compact[12, 4],
    compact[16, 4],
    compact[20, 12]
  )
end

def notion_request(method, path, body = nil)
  uri = URI("https://api.notion.com#{path}")
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  request = method == :post ? Net::HTTP::Post.new(uri) : Net::HTTP::Get.new(uri)
  request["Authorization"] = "Bearer #{ENV.fetch('NOTION_TOKEN')}"
  request["Notion-Version"] = NOTION_VERSION
  request["Content-Type"] = "application/json"
  request.body = JSON.generate(body) if body
  response = http.request(request)
  payload = JSON.parse(response.body)
  raise payload["message"] || "Notion #{response.code}" unless response.is_a?(Net::HTTPSuccess)

  payload
end

def plain_text(rich_text)
  Array(rich_text).map { |item| item["plain_text"] }.join.strip
end

def property_value(property)
  return "" unless property

  case property["type"]
  when "title"
    plain_text(property["title"])
  when "rich_text"
    plain_text(property["rich_text"])
  when "select"
    property.dig("select", "name").to_s
  when "multi_select"
    Array(property["multi_select"]).map { |item| item["name"] }.join(" + ")
  when "status"
    property.dig("status", "name").to_s
  when "date"
    property.dig("date", "start").to_s
  when "url"
    property["url"].to_s
  else
    ""
  end
end

def find_property(properties, *needles)
  properties.find do |name, _|
    normalized = name.to_s.downcase.gsub(/\s+/, "")
    needles.any? { |needle| normalized.include?(needle.downcase.gsub(/\s+/, "")) }
  end
end

def query_database(database_id)
  results = []
  cursor = nil
  loop do
    body = { page_size: 100 }
    body[:start_cursor] = cursor if cursor
    payload = notion_request(:post, "/v1/databases/#{database_id}/query", body)
    results.concat(payload.fetch("results"))
    break unless payload["has_more"]

    cursor = payload["next_cursor"]
  end
  results
end

def resolve_database_id
  configured = notion_id(ENV.fetch("NOTION_DATABASE_ID", DEFAULT_DB))
  notion_request(:get, "/v1/databases/#{configured}")
  configured
rescue StandardError
  page = notion_request(:get, "/v1/blocks/#{configured}/children")
  child = page.fetch("results").find { |block| block["type"] == "child_database" }
  raise "No Notion database found for #{configured}" unless child

  child["id"]
end

def posts_from_notion
  query_database(resolve_database_id).filter_map do |page|
    properties = page["properties"]
    name = property_value(find_property(properties, "project name", "name", "title")&.last || properties.values.find { |item| item["type"] == "title" })
    next if name.empty? || name.downcase.include?("what is ssf")

    start = property_value(find_property(properties, "開始製作")&.last)
    delivery = property_value(find_property(properties, "交片")&.last)
    publish = property_value(find_property(properties, "實際publish", "publish date", "publish")&.last)
    next if start.empty? && delivery.empty? && publish.empty?

    {
      id: page["id"],
      name: name,
      account: property_value(find_property(properties, "account")&.last),
      status: property_value(find_property(properties, "status")&.last),
      start: start,
      delivery: delivery,
      publish: publish,
      priority: property_value(find_property(properties, "priority")&.last),
      remarks: property_value(find_property(properties, "remarks", "remark")&.last),
    }
  end
end

def live_plan
  {
    title: "What is SSF",
    subtitle: "Social media production calendar",
    source: "Notion live",
    timezone: "Asia/Hong_Kong",
    syncedAt: Time.now.getlocal("+08:00").iso8601,
    posts: posts_from_notion,
  }
end

def write_snapshot(plan)
  File.write(
    File.join(ROOT, "data.js"),
    "const PLAN = #{JSON.pretty_generate(plan)};\n"
  )
end

class PlanServlet < WEBrick::HTTPServlet::AbstractServlet
  def do_GET(_request, response)
    respond(response)
  end

  def do_POST(_request, response)
    respond(response)
  end

  def respond(response)
    response["Content-Type"] = "application/json; charset=utf-8"
    response["Cache-Control"] = "no-store"
    unless ENV["NOTION_TOKEN"]
      response.status = 503
      response.body = JSON.generate(
        source: "snapshot",
        error: "missing_token",
        message: "Add NOTION_TOKEN to .env and share the Notion database with the integration."
      )
      return
    end

    response.status = 410
    response.body = JSON.generate(
      source: "clickup",
      error: "notion_disabled",
      message: "The live calendar now uses ClickUp subtasks. Notion sync is turned off so it cannot overwrite that plan."
    )
  rescue StandardError => error
    response.status = 502
    response.body = JSON.generate(source: "snapshot", error: "notion_error", message: error.message)
  end
end

load_env
server = WEBrick::HTTPServer.new(Port: PORT, DocumentRoot: ROOT)
server.mount("/api/plan", PlanServlet)
trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }
puts "SSF calendar: http://127.0.0.1:#{PORT}/"
server.start
